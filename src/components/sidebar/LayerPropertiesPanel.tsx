import { useState } from 'react';
import type { Blueprint, DisplayUnit, LayerId } from '../../model/types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/LayerPropertiesPanel.module.css';
import f from '../../styles/PropertiesPanel.module.css';
import type { TimePeriod } from '../../utils/timeTheme';
import { ALL_PERIODS, getTheme } from '../../utils/timeTheme';
import { displayToFeet, feetToDisplay } from '../../utils/units';
import { ToggleSwitch } from './ToggleSwitch';

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

interface LayerSectionProps {
  title: string;
  layerId?: LayerId;
  alwaysOn?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function LayerSection({
  title,
  layerId,
  alwaysOn,
  defaultOpen = true,
  children,
}: LayerSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const visibility = useUiStore((s) => s.layerVisibility);
  const setLayerVisible = useUiStore((s) => s.setLayerVisible);

  return (
    <div className={styles.section}>
      <button className={styles.header} onClick={() => setOpen(!open)}>
        {alwaysOn ? (
          <ToggleSwitch checked={true} onChange={() => {}} disabled title="Always visible" />
        ) : layerId ? (
          <ToggleSwitch
            checked={visibility[layerId]}
            onChange={(v) => setLayerVisible(layerId, v)}
            title={visibility[layerId] ? 'Hide' : 'Show'}
          />
        ) : null}
        <span className={styles.title}>{title}</span>
        <span className={`${styles.arrow} ${open ? styles.arrowOpen : ''}`}>▸</span>
      </button>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}

function DebugThemePanel() {
  const themeOverride = useUiStore((s) => s.themeOverride);
  const setThemeOverride = useUiStore((s) => s.setThemeOverride);
  const loadGarden = useGardenStore((s) => s.loadGarden);

  function handleResetGarden() {
    localStorage.removeItem('garden-planner-autosave');
    fetch(`${import.meta.env.BASE_URL}default.garden`)
      .then((r) => r.json())
      .then((g) => loadGarden(g))
      .catch(() => {});
  }

  return (
    <LayerSection title="Debug" defaultOpen>
      <div className={styles.themeGrid}>
        <button
          className={`${styles.themeSwatch} ${themeOverride === null ? styles.themeSwatchActive : ''}`}
          onClick={() => setThemeOverride(null)}
          title="Auto (time-based)"
        >
          <span
            className={styles.themeSwatchColor}
            style={{
              background:
                'conic-gradient(#E8A868, #58A0B0, #60C8E8, #D4B888, #3E2E60, #1A2744, #101828, #E8A868)',
            }}
          />
          <span className={styles.themeSwatchLabel}>Live</span>
        </button>
        <button
          className={`${styles.themeSwatch} ${themeOverride === 'slow-cycle' ? styles.themeSwatchActive : ''}`}
          onClick={() => setThemeOverride('slow-cycle')}
          title="Slow cycle (20s crossfade)"
        >
          <span
            className={styles.themeSwatchColor}
            style={{
              background:
                'linear-gradient(90deg, #E8A868, #60C8E8, #48C0E0, #804878, #3E2E60, #1A2744, #101828)',
            }}
          />
          <span className={styles.themeSwatchLabel}>Slow</span>
        </button>
        <button
          className={`${styles.themeSwatch} ${themeOverride === 'cycle' ? styles.themeSwatchActive : ''}`}
          onClick={() => setThemeOverride('cycle')}
          title="Fast cycle (5s crossfade)"
        >
          <span
            className={styles.themeSwatchColor}
            style={{
              background:
                'linear-gradient(90deg, #E8A868, #60C8E8, #48C0E0, #804878, #3E2E60, #1A2744, #101828, #E8A868, #60C8E8, #48C0E0, #804878, #3E2E60, #1A2744, #101828, #E8A868, #60C8E8, #48C0E0, #804878, #3E2E60, #1A2744, #101828)',
            }}
          />
          <span className={styles.themeSwatchLabel}>Fast</span>
        </button>
      </div>
      <hr className={styles.themeDivider} />
      <div className={styles.themeGrid}>
        {ALL_PERIODS.map((period: TimePeriod) => (
          <button
            key={period}
            className={`${styles.themeSwatch} ${themeOverride === period ? styles.themeSwatchActive : ''}`}
            onClick={() => setThemeOverride(period)}
            title={period}
          >
            <span
              className={styles.themeSwatchColor}
              style={{ background: getTheme(period).menuBarBg }}
            />
            <span className={styles.themeSwatchLabel}>{period}</span>
          </button>
        ))}
      </div>
      <hr className={styles.themeDivider} />
      <button
        className={styles.resetButton}
        onClick={handleResetGarden}
      >
        Reset to Default Garden
      </button>
    </LayerSection>
  );
}

export function LayerPropertiesPanel() {
  const garden = useGardenStore((s) => s.garden);
  const updateGarden = useGardenStore((s) => s.updateGarden);
  const showSurfaces = useUiStore((s) => s.showSurfaces);
  const setShowSurfaces = useUiStore((s) => s.setShowSurfaces);
  const setBlueprint = useGardenStore((s) => s.setBlueprint);
  const unit = garden.displayUnit;

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
              checked={showSurfaces}
              onChange={(e) => setShowSurfaces(e.target.checked)}
            />
            <svg className={styles.surfaceSwatch} width="14" height="14" viewBox="0 0 14 14">
              <rect width="14" height="14" rx="2" fill={showSurfaces ? '#A0926B' : '#3a3a3a'} />
              {showSurfaces && (
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
        </div>
      </LayerSection>

      <LayerSection title="Zones" layerId="zones">
        <div className={f.grid}>
          <span className={f.label}>No properties yet</span>
        </div>
      </LayerSection>

      <LayerSection title="Plantings" layerId="plantings">
        <div className={f.grid}>
          <span className={f.label}>No properties yet</span>
        </div>
      </LayerSection>

      <DebugThemePanel />
    </div>
  );
}
