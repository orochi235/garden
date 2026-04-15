import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { DisplayUnit, Blueprint } from '../../model/types';
import { feetToDisplay, displayToFeet } from '../../utils/units';
import styles from '../../styles/PropertiesPanel.module.css';

const DISPLAY_UNITS: DisplayUnit[] = ['ft', 'in', 'm', 'cm'];

const STRUCTURE_TYPES = ['raised-bed', 'pot', 'fence', 'path', 'patio'];

export function PropertiesPanel() {
  const garden = useGardenStore((s) => s.garden);
  const updateGarden = useGardenStore((s) => s.updateGarden);
  const updateStructure = useGardenStore((s) => s.updateStructure);
  const updateZone = useGardenStore((s) => s.updateZone);
  const setBlueprint = useGardenStore((s) => s.setBlueprint);
  const selectedIds = useUiStore((s) => s.selectedIds);

  function handleLoadBlueprint() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setBlueprint({ imageData: reader.result as string, x: 0, y: 0, scale: 1, opacity: 0.3 });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function updateBlueprint(updates: Partial<Blueprint>) {
    if (garden.blueprint) setBlueprint({ ...garden.blueprint, ...updates });
  }

  const unit = garden.displayUnit;

  if (selectedIds.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.title}>Garden Settings</div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <input className={styles.fieldInput} type="text" value={garden.name}
            onChange={(e) => updateGarden({ name: e.target.value })} />
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Width</span>
            <input className={styles.fieldInput} type="number" step="0.1" min="1"
              value={parseFloat(feetToDisplay(garden.widthFt, unit).toFixed(2))}
              onChange={(e) => updateGarden({ widthFt: displayToFeet(parseFloat(e.target.value) || 0, unit) })} />
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Height</span>
            <input className={styles.fieldInput} type="number" step="0.1" min="1"
              value={parseFloat(feetToDisplay(garden.heightFt, unit).toFixed(2))}
              onChange={(e) => updateGarden({ heightFt: displayToFeet(parseFloat(e.target.value) || 0, unit) })} />
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Grid</span>
          <input className={styles.fieldInput} type="number" step="0.25" min="0.25"
            value={parseFloat(feetToDisplay(garden.gridCellSizeFt, unit).toFixed(2))}
            onChange={(e) => updateGarden({ gridCellSizeFt: displayToFeet(parseFloat(e.target.value) || 1, unit) })} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Unit</span>
          <select className={styles.fieldInput} value={unit}
            onChange={(e) => updateGarden({ displayUnit: e.target.value as DisplayUnit })}>
            {DISPLAY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className={styles.title} style={{ marginTop: 8 }}>Blueprint</div>
        {garden.blueprint ? (
          <>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Opacity</span>
              <input className={styles.fieldInput} type="range" min="0" max="1" step="0.05"
                value={garden.blueprint.opacity}
                onChange={(e) => updateBlueprint({ opacity: parseFloat(e.target.value) })} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Scale</span>
              <input className={styles.fieldInput} type="number" min="0.01" step="0.1"
                value={garden.blueprint.scale}
                onChange={(e) => updateBlueprint({ scale: parseFloat(e.target.value) || 1 })} />
            </div>
            <div className={styles.field}>
              <button className={styles.fieldInput} style={{ cursor: 'pointer', textAlign: 'center' }}
                onClick={() => setBlueprint(null)}>
                Remove
              </button>
            </div>
          </>
        ) : (
          <div className={styles.field}>
            <button className={styles.fieldInput} style={{ cursor: 'pointer', textAlign: 'center' }}
              onClick={handleLoadBlueprint}>
              Load Image...
            </button>
          </div>
        )}
      </div>
    );
  }

  const selectedId = selectedIds[0];
  const structure = garden.structures.find((s) => s.id === selectedId);
  const zone = !structure ? garden.zones.find((z) => z.id === selectedId) : undefined;
  const obj = structure ?? zone;

  if (!obj) {
    return (
      <div className={styles.panel}>
        <div className={styles.title}>Properties</div>
        <div className={styles.field}><span className={styles.fieldLabel}>No object</span></div>
      </div>
    );
  }

  function updateObj(updates: Record<string, unknown>) {
    if (structure) updateStructure(selectedId, updates as Parameters<typeof updateStructure>[1]);
    else if (zone) updateZone(selectedId, updates as Parameters<typeof updateZone>[1]);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Properties</div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Label</span>
        <input className={styles.fieldInput} type="text" value={obj.label}
          onChange={(e) => updateObj({ label: e.target.value })} />
      </div>
      <div className={styles.row}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>X</span>
          <input className={styles.fieldInput} type="number" step="0.1"
            value={parseFloat(feetToDisplay(obj.x, unit).toFixed(2))}
            onChange={(e) => updateObj({ x: displayToFeet(parseFloat(e.target.value) || 0, unit) })} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Y</span>
          <input className={styles.fieldInput} type="number" step="0.1"
            value={parseFloat(feetToDisplay(obj.y, unit).toFixed(2))}
            onChange={(e) => updateObj({ y: displayToFeet(parseFloat(e.target.value) || 0, unit) })} />
        </div>
      </div>
      <div className={styles.row}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>W</span>
          <input className={styles.fieldInput} type="number" step="0.1" min="0.1"
            value={parseFloat(feetToDisplay(obj.width, unit).toFixed(2))}
            onChange={(e) => updateObj({ width: displayToFeet(parseFloat(e.target.value) || 0.1, unit) })} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>H</span>
          <input className={styles.fieldInput} type="number" step="0.1" min="0.1"
            value={parseFloat(feetToDisplay(obj.height, unit).toFixed(2))}
            onChange={(e) => updateObj({ height: displayToFeet(parseFloat(e.target.value) || 0.1, unit) })} />
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Color</span>
        <input className={styles.colorInput} type="color" value={obj.color.slice(0, 7)}
          onChange={(e) => updateObj({ color: e.target.value })} />
      </div>
      {structure && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <select className={styles.fieldInput} value={structure.type}
            onChange={(e) => updateObj({ type: e.target.value })}>
            {STRUCTURE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
