import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import f from '../../styles/PropertiesPanel.module.css';
import { displayToFeet, feetToDisplay } from '../../utils/units';

const STRUCTURE_TYPES = ['raised-bed', 'pot', 'fence', 'path', 'patio'];

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

  const selectedId = selectedIds[0];
  const structure = garden.structures.find((s) => s.id === selectedId);
  const zone = !structure ? garden.zones.find((z) => z.id === selectedId) : undefined;
  const obj = structure ?? zone;

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
          value={parseFloat(feetToDisplay(obj.height, unit).toFixed(2))}
          onChange={(e) =>
            updateObj({ height: displayToFeet(parseFloat(e.target.value) || 0.1, unit) })
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
            <select
              className={`${f.select} ${f.span12}`}
              value={structure.type}
              onChange={(e) => updateObj({ type: e.target.value })}
            >
              {STRUCTURE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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
