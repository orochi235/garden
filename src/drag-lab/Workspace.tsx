import { useState, useCallback, useEffect } from 'react';
import type { LabItem, Point, ContainerShape } from './types';
import type { WorkspaceState, SavedState } from './types';
import { getStrategy, strategyNames } from './strategies';
import { CanvasRenderer } from './CanvasRenderer';
import { ItemPalette } from './ItemPalette';
import { useDragHandle, useDropZone } from '@/utils/pointerDrag';
import type { QuadtreeLayerId } from './strategies/quadtreeRenderer';
import {
  QUADTREE_LAYER_LABELS,
  QUADTREE_LAYER_CSS,
  LAYER_DEFAULT_OFF,
  LAYER_ALWAYS_ON,
  LAYER_CONFIG_KEY,
  getLayerOrder,
} from './strategies/quadtree';

function LegendRow({
  layer,
  index,
  highlighted,
  onSetDropIdx,
  onReorder,
  checkboxValue,
  onSetConfig,
}: {
  layer: QuadtreeLayerId;
  index: number;
  highlighted: boolean;
  onSetDropIdx: (i: number | null) => void;
  onReorder: (fromLayer: QuadtreeLayerId, toIdx: number) => void;
  checkboxValue: boolean;
  onSetConfig: (key: string, value: unknown) => void;
}) {
  const handle = useDragHandle(() => ({ kind: 'legend-row', ids: [layer] }));
  const dropRef = useDropZone<HTMLDivElement>({
    accepts: (k) => k === 'legend-row',
    onOver: (active) => { if (!active) onSetDropIdx(null); },
    onMove: () => onSetDropIdx(index),
    onDrop: (payload) => {
      onReorder(payload.ids[0] as QuadtreeLayerId, index);
      onSetDropIdx(null);
    },
  });
  return (
    <div
      ref={dropRef}
      className={`dl-legend-item dl-legend-draggable${highlighted ? ' dl-legend-drop-target' : ''}`}
      style={handle.style}
      onPointerDown={handle.onPointerDown}
    >
      <span className="dl-legend-handle" title="Drag to reorder">&#x2261;</span>
      {LAYER_ALWAYS_ON.has(layer) ? (
        <span className="dl-legend-checkbox-spacer" />
      ) : (
        <input
          type="checkbox"
          checked={checkboxValue}
          onChange={(e) => onSetConfig(LAYER_CONFIG_KEY[layer], e.target.checked)}
        />
      )}
      <span className={`dl-legend-swatch ${QUADTREE_LAYER_CSS[layer]}`} />
      <span>{QUADTREE_LAYER_LABELS[layer]}</span>
    </div>
  );
}

function QuadtreeLegend({ state, onSetConfig }: {
  state: WorkspaceState;
  onSetConfig: (key: string, value: unknown) => void;
}) {
  const rawOrder = getLayerOrder(state.config);
  // Display reversed: top of list = top of visual stack (last to render)
  const displayOrder = [...rawOrder].reverse();
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const reorder = (fromLayer: QuadtreeLayerId, toIdx: number) => {
    const fromIdx = displayOrder.indexOf(fromLayer);
    if (fromIdx < 0 || fromIdx === toIdx) return;
    const next = [...displayOrder];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onSetConfig('layerOrder', [...next].reverse());
  };

  return (
    <div className="dl-legend">
      <div className="dl-controls-divider" />
      <div className="dl-legend-section-label">Render layers — top draws last</div>
      {displayOrder.map((layer, i) => (
        <LegendRow
          key={layer}
          layer={layer}
          index={i}
          highlighted={dropIdx === i}
          onSetDropIdx={setDropIdx}
          onReorder={reorder}
          checkboxValue={LAYER_DEFAULT_OFF.has(layer) ? state.config[LAYER_CONFIG_KEY[layer]] === true : state.config[LAYER_CONFIG_KEY[layer]] !== false}
          onSetConfig={onSetConfig}
        />
      ))}
      <div className="dl-controls-divider" />
      <div className="dl-legend-section-label">Drag overlays</div>
      {([
        ['showTarget', 'dl-legend-target', 'Drop target'],
        ['showSplits', 'dl-legend-split', 'Will split'],
        ['showPutative', 'dl-legend-putative', 'Possible cells'],
      ] as const).map(([key, cls, label]) => (
        <label key={key} className="dl-legend-item">
          <input
            type="checkbox"
            checked={state.config[key] !== false}
            onChange={(e) => onSetConfig(key, e.target.checked)}
          />
          <span className={`dl-legend-swatch ${cls}`} />
          <span>{label}</span>
        </label>
      ))}
      <div className="dl-controls-divider" />
      <div className="dl-legend-section-label">Render options</div>
      {([
        ['depthScaledBorders', 'Depth-scaled borders'],
        ['opaqueBorders', 'Opaque borders'],
      ] as const).map(([key, label]) => (
        <label key={key} className="dl-legend-item">
          <input
            type="checkbox"
            checked={state.config[key] !== false}
            onChange={(e) => onSetConfig(key, e.target.checked)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

interface WorkspaceProps {
  state: WorkspaceState;
  saves: SavedState[];
  onUpdate: (patch: Partial<WorkspaceState>) => void;
  onSetStrategy: (name: string) => void;
  onSetConfig: (key: string, value: unknown) => void;
  onAddItem: (item: LabItem) => void;
  onRemoveItem: (itemId: string) => void;
  onSetContainerSize: (w: number, h: number) => void;
  onSetContainerShape: (shape: ContainerShape) => void;
  onSave: (name: string) => void;
  onLoad: (save: SavedState) => void;
  onClone: () => void;
  onReset: () => void;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function Workspace({
  state,
  saves,
  onUpdate,
  onSetStrategy,
  onSetConfig,
  onAddItem,
  onRemoveItem,
  onSetContainerSize,
  onSetContainerShape,
  onSave,
  onLoad,
  onClone,
  onReset,
  onClose,
  onUndo,
  onRedo,
}: WorkspaceProps) {
  const [zoom, setZoom] = useState(1);
  const strategy = getStrategy(state.strategyName);
  const schema = strategy.configSchema();

  const handlePickUpItem = useCallback(
    (itemId: string): LabItem | undefined => {
      const item = state.items.find((i) => i.id === itemId);
      if (item) onRemoveItem(itemId);
      return item;
    },
    [state.items, onRemoveItem],
  );

  const handleDrop = useCallback(
    (pos: Point, item: LabItem) => {
      const bounds = { x: 0, y: 0, width: state.containerWidth, height: state.containerHeight };
      const result = strategy.onDrop(bounds, state.containerShape, pos, item, state.items, state.config);
      onAddItem(result.item);
    },
    [strategy, state, onAddItem],
  );

  const handleSave = () => {
    const name = prompt('Save name:');
    if (name) onSave(name);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); onUndo(); }
      if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); onRedo(); }
      if (mod && e.key === 'y') { e.preventDefault(); onRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onUndo, onRedo]);

  return (
    <div className="dl-workspace">
      <div className="dl-toolbar">
        <span className="dl-toolbar-title">{state.strategyName}</span>
        <button type="button" onClick={onUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button type="button" onClick={onRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          title={`Zoom: ${Math.round(zoom * 100)}%`}
          className="dl-zoom-slider"
        />
        <button type="button" onClick={handleSave} title="Save state">Save</button>
        <select
          onChange={(e) => { if (e.target.value) onLoad(saves[Number(e.target.value)]); }}
          value=""
        >
          <option value="">Load...</option>
          {saves.map((s, i) => (
            <option key={s.timestamp} value={i}>{s.name}</option>
          ))}
        </select>
        <button type="button" onClick={() => setZoom(1)} title="Reset zoom to 100%">⌂</button>
        <button type="button" onClick={onClone} title="Clone workspace">Clone</button>
        <button type="button" onClick={onReset} title="Reset to defaults">Reset</button>
        <button type="button" onClick={onClose} title="Close workspace">X</button>
      </div>

      <div className="dl-workspace-body">
        <div className="dl-canvas-area">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
            <CanvasRenderer
              width={state.containerWidth}
              height={state.containerHeight}
              shape={state.containerShape}
              items={state.items}
              strategy={strategy}
              config={state.config}
              onDrop={handleDrop}
              onPickUpItem={handlePickUpItem}
            />
          </div>
        </div>

        <div className="dl-controls">
          <label className="dl-control-row">
            <span>Strategy</span>
            <select value={state.strategyName} onChange={(e) => onSetStrategy(e.target.value)}>
              {strategyNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <label className="dl-control-row">
            <span>Shape</span>
            <select
              value={state.containerShape}
              onChange={(e) => onSetContainerShape(e.target.value as ContainerShape)}
            >
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
            </select>
          </label>

          <label className="dl-control-row dl-checkbox-row">
            <input
              type="checkbox"
              checked={state.expandToFill}
              onChange={(e) => onUpdate({ expandToFill: e.target.checked })}
            />
            <span>Expand to fill</span>
          </label>

          <label className="dl-control-row dl-checkbox-row">
            <input
              type="checkbox"
              checked={!!state.config.overlayGuides}
              onChange={(e) => onSetConfig('overlayGuides', e.target.checked)}
            />
            <span>Overlay guides</span>
          </label>

          <label className="dl-control-row">
            <span>Width: {state.containerWidth.toFixed(1)} ft</span>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={state.containerWidth}
              onChange={(e) => onSetContainerSize(Number(e.target.value), state.containerHeight)}
            />
          </label>

          <label className="dl-control-row">
            <span>Height: {state.containerHeight.toFixed(1)} ft</span>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={state.containerHeight}
              onChange={(e) => onSetContainerSize(state.containerWidth, Number(e.target.value))}
            />
          </label>

          <div className="dl-controls-divider" />

          {schema.map((field) => (
            <label key={field.key} className={`dl-control-row${field.type === 'checkbox' ? ' dl-checkbox-row' : ''}`}>
              {field.type === 'checkbox' && (
                <input
                  type="checkbox"
                  checked={(state.config[field.key] as boolean) ?? field.default}
                  onChange={(e) => onSetConfig(field.key, e.target.checked)}
                />
              )}
              <span>
                {field.label}
                {field.type === 'slider' && `: ${(state.config[field.key] as number)?.toFixed(field.step != null && field.step % 1 === 0 ? 0 : 2) ?? field.default}`}
              </span>
              {field.type === 'slider' && (
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={(state.config[field.key] as number) ?? field.default}
                  onChange={(e) => onSetConfig(field.key, Number(e.target.value))}
                />
              )}
              {field.type === 'dropdown' && (
                <select
                  value={(state.config[field.key] as string) ?? field.default}
                  onChange={(e) => onSetConfig(field.key, e.target.value)}
                >
                  {field.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
            </label>
          ))}

          <div className="dl-controls-divider" />

          <ItemPalette
            mode={state.paletteMode}
            onSetMode={(mode) => onUpdate({ paletteMode: mode })}
          />

          {state.strategyName === 'Quadtree' && (
            <QuadtreeLegend state={state} onSetConfig={onSetConfig} />
          )}
        </div>
      </div>
    </div>
  );
}
