import type { Blueprint, DisplayUnit } from '../../model/types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/LayerPropertiesPanel.module.css';
import f from '../../styles/PropertiesPanel.module.css';
import { displayToFeet, feetToDisplay } from '../../utils/units';
import { AlmanacPanel } from './AlmanacPanel';
import { DebugThemePanel } from './DebugThemePanel';
import { ThemeDebugPanel } from './ThemeDebugPanel';
import { LayerSection } from './LayerSection';
import { RenderLayersPanel } from './RenderLayersPanel';

const DISPLAY_UNITS: DisplayUnit[] = ['ft', 'in', 'm', 'cm'];

const GROUND_COLORS = [
  { value: '#4A7C59', label: 'Grass' },
  { value: '#2D5A27', label: 'Dark grass' },
  { value: '#7FB069', label: 'Lime' },
  { value: '#8B6914', label: 'Dirt' },
  { value: '#5C4033', label: 'Dark soil' },
  { value: '#E8D5B7', label: 'Sand' },
  { value: '#A0522D', label: 'Mulch' },
  { value: '#C2B8A3', label: 'Gravel' },
  { value: '#B0ADA6', label: 'Concrete' },
  { value: '#505050', label: 'Asphalt' },
  { value: '#C75B39', label: 'Clay' },
  { value: '#E8E0D0', label: 'Parchment' },
];

export function LayerPropertiesPanel() {
  const garden = useGardenStore((s) => s.garden);
  const updateGarden = useGardenStore((s) => s.updateGarden);
  const renderLayerVisibility = useUiStore((s) => s.renderLayerVisibility);
  const setRenderLayerVisible = useUiStore((s) => s.setRenderLayerVisible);
  const setBlueprint = useGardenStore((s) => s.setBlueprint);
  const appMode = useUiStore((s) => s.appMode);
  const unit = garden.displayUnit;

  if (appMode === 'seed-starting') {
    return (
      <div className={styles.panel}>
        <AlmanacPanel />
        <RenderLayersPanel />
        <DebugThemePanel />
        <ThemeDebugPanel />
      </div>
    );
  }

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

  return (
    <div className={styles.panel}>
      <LayerSection title="Garden" alwaysOn defaultOpen>
        <div className={f.grid}>
          <span className={f.label}>Name</span>
          <input
            className={`${f.input} ${f.span12}`}
            type="text"
            value={garden.name}
            onChange={(e) => updateGarden({ name: e.target.value })}
          />

          <span className={f.label}>Area</span>
          <span className={`${f.miniLabel} ${f.span2}`}>W</span>
          <input
            className={`${f.input} ${f.span4}`}
            type="number"
            step="0.1"
            min="1"
            value={parseFloat(feetToDisplay(garden.widthFt, unit).toFixed(2))}
            onChange={(e) =>
              updateGarden({ widthFt: displayToFeet(parseFloat(e.target.value) || 0, unit) })
            }
          />
          <span className={`${f.miniLabel} ${f.span2}`}>H</span>
          <input
            className={`${f.input} ${f.span4}`}
            type="number"
            step="0.1"
            min="1"
            value={parseFloat(feetToDisplay(garden.heightFt, unit).toFixed(2))}
            onChange={(e) =>
              updateGarden({ heightFt: displayToFeet(parseFloat(e.target.value) || 0, unit) })
            }
          />

          <span className={f.label}>Grid</span>
          <input
            className={`${f.input} ${f.span8}`}
            type="number"
            step="0.25"
            min="0.25"
            value={parseFloat(feetToDisplay(garden.gridCellSizeFt, unit).toFixed(2))}
            onChange={(e) =>
              updateGarden({ gridCellSizeFt: displayToFeet(parseFloat(e.target.value) || 1, unit) })
            }
          />
          <select
            className={`${f.select} ${f.span4}`}
            value={unit}
            onChange={(e) => updateGarden({ displayUnit: e.target.value as DisplayUnit })}
          >
            {DISPLAY_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </LayerSection>

      <LayerSection title="Ground" layerId="ground">
        <div className={styles.swatchGrid}>
          {GROUND_COLORS.map((c) => (
            <button
              key={c.value}
              className={`${styles.swatch} ${garden.groundColor === c.value ? styles.swatchActive : ''}`}
              style={{ background: c.value }}
              title={c.label}
              onClick={() => updateGarden({ groundColor: c.value })}
            />
          ))}
        </div>
      </LayerSection>

      <LayerSection title="Blueprint" layerId="blueprint">
        <div className={f.grid}>
          {garden.blueprint ? (
            <>
              <span className={f.label}>Opacity</span>
              <input
                className={`${f.input} ${f.span12}`}
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={garden.blueprint.opacity}
                onChange={(e) => updateBlueprint({ opacity: parseFloat(e.target.value) })}
              />
              <span className={f.label}>Scale</span>
              <input
                className={`${f.input} ${f.span12}`}
                type="number"
                min="0.01"
                step="0.1"
                value={garden.blueprint.scale}
                onChange={(e) => updateBlueprint({ scale: parseFloat(e.target.value) || 1 })}
              />
              <span className={f.label}></span>
              <button
                className={`${f.input} ${f.span12}`}
                style={{ cursor: 'pointer', textAlign: 'center' }}
                onClick={() => setBlueprint(null)}
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <span className={f.label}></span>
              <button
                className={`${f.input} ${f.span12}`}
                style={{ cursor: 'pointer', textAlign: 'center' }}
                onClick={handleLoadBlueprint}
              >
                Load Image...
              </button>
            </>
          )}
        </div>
      </LayerSection>

      <LayerSection title="Structures" layerId="structures">
        <div className={f.grid}>
          <label className={styles.surfaceToggle}>
            <input
              type="checkbox"
              checked={renderLayerVisibility['structure-surfaces'] ?? false}
              onChange={(e) => setRenderLayerVisible('structure-surfaces', e.target.checked)}
            />
            <svg className={styles.surfaceSwatch} width="14" height="14" viewBox="0 0 14 14">
              <rect width="14" height="14" rx="2" fill={renderLayerVisibility['structure-surfaces'] ? '#A0926B' : '#3a3a3a'} />
              {renderLayerVisibility['structure-surfaces'] && (
                <g stroke="goldenrod" strokeWidth="1.2">
                  <line x1="0" y1="5" x2="5" y2="0" />
                  <line x1="0" y1="10" x2="10" y2="0" />
                  <line x1="0" y1="15" x2="15" y2="0" />
                  <line x1="5" y1="15" x2="15" y2="5" />
                  <line x1="10" y1="15" x2="15" y2="10" />
                </g>
              )}
            </svg>
            <span>Show surface hatching</span>
          </label>
          <label className={styles.surfaceToggle}>
            <input
              type="checkbox"
              checked={renderLayerVisibility['structure-plantable-area'] ?? false}
              onChange={(e) => setRenderLayerVisible('structure-plantable-area', e.target.checked)}
            />
            <span>Show plantable area</span>
          </label>
        </div>
      </LayerSection>

      <LayerSection title="Zones" layerId="zones">
        <div className={f.grid}>
          <span className={f.label}>No properties yet</span>
        </div>
      </LayerSection>

      <LayerSection title="Plantings" layerId="plantings">
        <div className={f.grid}>
          <label className={styles.surfaceToggle}>
            <input
              type="checkbox"
              checked={renderLayerVisibility['planting-footprint-circles'] ?? true}
              onChange={(e) => setRenderLayerVisible('planting-footprint-circles', e.target.checked)}
            />
            <span>Show footprint circles</span>
          </label>
          <label className={styles.surfaceToggle}>
            <input
              type="checkbox"
              checked={renderLayerVisibility['planting-spacing'] ?? true}
              onChange={(e) => setRenderLayerVisible('planting-spacing', e.target.checked)}
            />
            <span>Show spacing borders</span>
          </label>
          <label className={styles.surfaceToggle}>
            <input
              type="checkbox"
              checked={renderLayerVisibility['planting-measurements'] ?? false}
              onChange={(e) => setRenderLayerVisible('planting-measurements', e.target.checked)}
            />
            <span>Show measurements</span>
          </label>
        </div>
      </LayerSection>

      <RenderLayersPanel />
      <DebugThemePanel />
    </div>
  );
}
