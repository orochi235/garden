import { getCultivar } from '../../model/cultivars';
import type { Layout, LayoutType } from '../../model/layout';
import type { FillType } from '../../model/types';
import { FILL_COLORS } from '../../model/types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import f from '../../styles/PropertiesPanel.module.css';
import { displayToFeet, feetToDisplay } from '../../utils/units';
import { SelectionPanel } from './SelectionPanel';

const FILL_TYPES: FillType[] = ['soil', 'sand', 'rocks', 'peat', 'potting-mix'];

const FILL_LABELS: Record<FillType, string> = {
  soil: 'Soil',
  sand: 'Sand',
  rocks: 'Rocks',
  peat: 'Peat',
  'potting-mix': 'Potting mix',
};


export function PropertiesPanel() {
  const garden = useGardenStore((s) => s.garden);
  const updateStructure = useGardenStore((s) => s.commitStructureUpdate);
  const updateZone = useGardenStore((s) => s.commitZoneUpdate);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const unit = garden.displayUnit;

  if (selectedIds.length === 0) {
    return (
      <div className={f.panel}>
        <div className={f.title}>Properties</div>
        <div className={f.grid}>
          <span className={f.label}>No selection</span>
        </div>
      </div>
    );
  }

  if (selectedIds.length > 1) {
    return <SelectionPanel />;
  }

  const selectedId = selectedIds[0];
  const structure = garden.structures.find((s) => s.id === selectedId);
  const zone = !structure ? garden.zones.find((z) => z.id === selectedId) : undefined;
  const planting = !structure && !zone ? garden.plantings.find((p) => p.id === selectedId) : undefined;
  const obj = structure ?? zone;

  if (planting) {
    const cultivar = getCultivar(planting.cultivarId);
    const parent = garden.structures.find((s) => s.id === planting.parentId)
      ?? garden.zones.find((z) => z.id === planting.parentId);
    return (
      <div className={f.panel}>
        <div className={f.title}>Planting</div>
        <div className={f.grid}>
          <span className={f.label}>Species</span>
          <div className={f.span12}>
            <span className={f.readOnly}>{cultivar?.name ?? planting.cultivarId}</span>
            {cultivar?.taxonomicName && (
              <div className={f.readOnly} style={{ fontStyle: 'italic', fontSize: '0.9em', opacity: 0.7 }}>
                {cultivar.taxonomicName}
              </div>
            )}
          </div>

          {cultivar?.variety && (
            <>
              <span className={f.label}>Variety</span>
              <span className={`${f.readOnly} ${f.span12}`}>{cultivar.variety}</span>
            </>
          )}

          <span className={f.label}>Label</span>
          <input
            className={`${f.input} ${f.span12}`}
            type="text"
            value={planting.label}
            onChange={(e) => useGardenStore.getState().commitPlantingUpdate(selectedId, { label: e.target.value })}
          />

          <span className={f.label}>Position</span>
          <span className={`${f.miniLabel} ${f.span2}`}>X</span>
          <input
            className={`${f.input} ${f.span4}`}
            type="number"
            step="0.1"
            value={parseFloat(feetToDisplay(planting.x, unit).toFixed(2))}
            onChange={(e) => useGardenStore.getState().commitPlantingUpdate(selectedId, { x: displayToFeet(parseFloat(e.target.value) || 0, unit) })}
          />
          <span className={`${f.miniLabel} ${f.span2}`}>Y</span>
          <input
            className={`${f.input} ${f.span4}`}
            type="number"
            step="0.1"
            value={parseFloat(feetToDisplay(planting.y, unit).toFixed(2))}
            onChange={(e) => useGardenStore.getState().commitPlantingUpdate(selectedId, { y: displayToFeet(parseFloat(e.target.value) || 0, unit) })}
          />

          {cultivar && (
            <>
              <span className={f.label}>Footprint</span>
              <span className={`${f.readOnly} ${f.span12}`}>
                {feetToDisplay(cultivar.footprintFt, unit).toFixed(1)} {unit}
              </span>

              <span className={f.label}>Spacing</span>
              <span className={`${f.readOnly} ${f.span12}`}>
                {feetToDisplay(cultivar.spacingFt, unit).toFixed(1)} {unit}
              </span>
            </>
          )}

          {parent && (
            <>
              <span className={f.label}>Container</span>
              <span className={`${f.readOnly} ${f.span12}`}>{parent.label || ('type' in parent ? parent.type : 'zone')}</span>
            </>
          )}

          <span className={f.label}></span>
          <button
            className={`${f.input} ${f.span12}`}
            style={{ cursor: 'pointer', textAlign: 'center', color: 'var(--color-terracotta)' }}
            onClick={() => {
              useGardenStore.getState().removePlanting(selectedId);
              useUiStore.getState().clearSelection();
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  if (!obj) {
    return (
      <div className={f.panel}>
        <div className={f.title}>Properties</div>
        <div className={f.grid}>
          <span className={f.label}>No object</span>
        </div>
      </div>
    );
  }

  function updateObj(updates: Record<string, unknown>) {
    if (structure) updateStructure(selectedId, updates as Parameters<typeof updateStructure>[1]);
    else if (zone) updateZone(selectedId, updates as Parameters<typeof updateZone>[1]);
  }

  return (
    <div className={f.panel}>
      <div className={f.title}>Properties</div>
      <div className={f.grid}>
        <span className={f.label}>Label</span>
        <input
          className={`${f.input} ${f.span12}`}
          type="text"
          value={obj.label}
          onChange={(e) => updateObj({ label: e.target.value })}
        />

        <span className={f.label}>Position</span>
        <span className={`${f.miniLabel} ${f.span2}`}>X</span>
        <input
          className={`${f.input} ${f.span4}`}
          type="number"
          step="0.1"
          value={parseFloat(feetToDisplay(obj.x, unit).toFixed(2))}
          onChange={(e) => updateObj({ x: displayToFeet(parseFloat(e.target.value) || 0, unit) })}
        />
        <span className={`${f.miniLabel} ${f.span2}`}>Y</span>
        <input
          className={`${f.input} ${f.span4}`}
          type="number"
          step="0.1"
          value={parseFloat(feetToDisplay(obj.y, unit).toFixed(2))}
          onChange={(e) => updateObj({ y: displayToFeet(parseFloat(e.target.value) || 0, unit) })}
        />

        <span className={f.label}>Area</span>
        <span className={`${f.miniLabel} ${f.span2}`}>W</span>
        <input
          className={`${f.input} ${f.span4}`}
          type="number"
          step="0.1"
          min="0.1"
          value={parseFloat(feetToDisplay(obj.width, unit).toFixed(2))}
          onChange={(e) =>
            updateObj({ width: displayToFeet(parseFloat(e.target.value) || 0.1, unit) })
          }
        />
        <span className={`${f.miniLabel} ${f.span2}`}>H</span>
        <input
          className={`${f.input} ${f.span4}`}
          type="number"
          step="0.1"
          min="0.1"
          value={parseFloat(feetToDisplay(obj.length, unit).toFixed(2))}
          onChange={(e) =>
            updateObj({ length: displayToFeet(parseFloat(e.target.value) || 0.1, unit) })
          }
        />

        <span className={f.label}>Color</span>
        <input
          className={f.colorInput}
          type="color"
          value={obj.color.slice(0, 7)}
          onChange={(e) => updateObj({ color: e.target.value })}
        />

        {structure && (
          <>
            <span className={f.label}>Type</span>
            <span className={`${f.readOnly} ${f.span12}`}>{structure.type}</span>
          </>
        )}

        {structure?.container && (
          <>
            <span className={f.label}>Fill</span>
            <div className={f.span12} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 2,
                  background: structure.fill ? FILL_COLORS[structure.fill] : 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  flexShrink: 0,
                }}
              />
              <select
                className={f.select}
                style={{ flex: 1 }}
                value={structure.fill ?? 'soil'}
                onChange={(e) => updateObj({ fill: e.target.value as FillType })}
              >
                {FILL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FILL_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <span className={f.label}></span>
            <label className={f.span12} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={structure.clipChildren !== false}
                onChange={(e) => updateObj({ clipChildren: e.target.checked })}
              />
              <span>Clip plantings to container</span>
            </label>
          </>
        )}

        {((structure && (structure.container || structure.surface)) || zone) && (
          <>
            {/* Layout */}
            <span className={f.label}>Layout</span>
            <select
              value={obj.layout?.type ?? 'none'}
              onChange={(e) => {
                const t = e.target.value as LayoutType | 'none';
                if (t === 'none') { updateObj({ layout: null }); return; }
                const next: Layout =
                  t === 'single' ? { type: 'single' }
                  : t === 'grid' ? { type: 'grid', cellSizeFt: 1 }
                  : { type: 'snap-points', points: [] };
                updateObj({ layout: next });
              }}
            >
              <option value="none">None</option>
              <option value="single">Single</option>
              <option value="grid">Grid</option>
              <option value="snap-points">Snap Points</option>
            </select>

            {obj.layout?.type === 'grid' && (
              <label className={f.fieldRow}>
                <span className={f.label}>Cell size (ft)</span>
                <input
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={obj.layout.cellSizeFt}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 1;
                    updateObj({ layout: { type: 'grid', cellSizeFt: v } });
                  }}
                />
              </label>
            )}
          </>
        )}

        <span className={f.label}></span>
        <button
          className={`${f.input} ${f.span12}`}
          style={{ cursor: 'pointer', textAlign: 'center', color: 'var(--color-terracotta)' }}
          onClick={() => {
            if (structure) useGardenStore.getState().removeStructure(selectedId);
            else useGardenStore.getState().removeZone(selectedId);
            useUiStore.getState().clearSelection();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
