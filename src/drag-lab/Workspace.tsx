import { useState, useCallback } from 'react';
import type { LabItem, Point, ContainerShape } from './types';
import type { WorkspaceState, SavedState } from './types';
import { getStrategy, strategyNames } from './strategies';
import { CanvasRenderer } from './CanvasRenderer';
import { ItemPalette } from './ItemPalette';

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
}: WorkspaceProps) {
  const [dragItem, setDragItem] = useState<LabItem | null>(null);
  const [zoom, setZoom] = useState(1);
  const strategy = getStrategy(state.strategyName);
  const schema = strategy.configSchema();

  const handleDragStart = useCallback((item: LabItem) => {
    setDragItem(item);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragItem(null);
  }, []);

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
      setDragItem(null);
    },
    [strategy, state, onAddItem],
  );

  const handleSave = () => {
    const name = prompt('Save name:');
    if (name) onSave(name);
  };

  return (
    <div className="dl-workspace">
      <div className="dl-toolbar">
        <span className="dl-toolbar-title">{state.strategyName}</span>
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
        <button type="button" onClick={onClone} title="Clone workspace">Clone</button>
        <button type="button" onClick={onReset} title="Reset to defaults">Reset</button>
        <button type="button" onClick={onClose} title="Close workspace">X</button>
      </div>

      <div className="dl-workspace-body">
        <div className="dl-canvas-area">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            <CanvasRenderer
              width={state.containerWidth}
              height={state.containerHeight}
              shape={state.containerShape}
              items={state.items}
              strategy={strategy}
              config={state.config}
              onDrop={handleDrop}
              onPickUpItem={handlePickUpItem}
              dragItem={dragItem}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
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
            <label key={field.key} className="dl-control-row">
              <span>
                {field.label}
                {field.type === 'slider' && `: ${(state.config[field.key] as number)?.toFixed(2) ?? field.default}`}
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
              {field.type === 'checkbox' && (
                <input
                  type="checkbox"
                  checked={(state.config[field.key] as boolean) ?? field.default}
                  onChange={(e) => onSetConfig(field.key, e.target.checked)}
                />
              )}
            </label>
          ))}

          <div className="dl-controls-divider" />

          <ItemPalette
            mode={state.paletteMode}
            onSetMode={(mode) => onUpdate({ paletteMode: mode })}
            onDragStart={handleDragStart}
          />

          {state.strategyName === 'Quadtree' && (
            <div className="dl-legend">
              <div className="dl-controls-divider" />
              {([
                ['showOccupied', 'dl-legend-occupied', 'Occupied'],
                ['showViolations', 'dl-legend-violation', 'Violation'],
                ['showTarget', 'dl-legend-target', 'Drop target'],
                ['showSplits', 'dl-legend-split', 'Will split'],
                ['showPutative', 'dl-legend-putative', 'Possible cells'],
                ['showFootprint', 'dl-legend-footprint', 'Footprint'],
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
