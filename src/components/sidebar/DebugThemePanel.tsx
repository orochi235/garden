import { useGardenStore } from '../../store/gardenStore';
import type { LabelMode } from '../../store/uiStore';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/LayerPropertiesPanel.module.css';
import type { TimePeriod } from '../../utils/timeTheme';
import { ALL_PERIODS, getTheme } from '../../utils/timeTheme';
import { LayerSection } from './LayerSection';

const LABEL_MODES: { value: LabelMode; label: string }[] = [
  { value: 'all', label: 'All layers' },
  { value: 'active-layer', label: 'Active layer' },
  { value: 'selection', label: 'Selection' },
];

export function DebugThemePanel() {
  const themeOverride = useUiStore((s) => s.themeOverride);
  const setThemeOverride = useUiStore((s) => s.setThemeOverride);
  const debugOverlappingLabels = useUiStore((s) => s.debugOverlappingLabels);
  const setDebugOverlappingLabels = useUiStore((s) => s.setDebugOverlappingLabels);
  const labelMode = useUiStore((s) => s.labelMode);
  const setLabelMode = useUiStore((s) => s.setLabelMode);
  const labelFontSize = useUiStore((s) => s.labelFontSize);
  const setLabelFontSize = useUiStore((s) => s.setLabelFontSize);
  const plantIconScale = useUiStore((s) => s.plantIconScale);
  const setPlantIconScale = useUiStore((s) => s.setPlantIconScale);
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
          className={`${styles.themeSwatch} ${themeOverride === 'live' ? styles.themeSwatchActive : ''}`}
          onClick={() => setThemeOverride('live')}
          title="Live (geolocation-based)"
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
          className={`${styles.themeSwatch} ${themeOverride === null ? styles.themeSwatchActive : ''}`}
          onClick={() => setThemeOverride(null)}
          title="Cycle (clock-based)"
        >
          <span
            className={styles.themeSwatchColor}
            style={{
              background:
                'conic-gradient(from 90deg, #E8A868, #60C8E8, #48C0E0, #804878, #1A2744, #E8A868)',
            }}
          />
          <span className={styles.themeSwatchLabel}>Cycle</span>
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
      <label className={styles.surfaceToggle}>
        <input
          type="checkbox"
          checked={debugOverlappingLabels}
          onChange={(e) => setDebugOverlappingLabels(e.target.checked)}
        />
        <span>Show overlapping labels</span>
      </label>
      <hr className={styles.themeDivider} />
      <label className={styles.sliderLabel}>
        <span>Label font size: {labelFontSize}px</span>
        <input
          type="range"
          min={8}
          max={24}
          step={1}
          value={labelFontSize}
          onChange={(e) => setLabelFontSize(Number(e.target.value))}
          className={styles.slider}
        />
      </label>
      <label className={styles.sliderLabel}>
        <span>Plant icon size: {Math.round(plantIconScale * 100)}%</span>
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.25}
          value={plantIconScale}
          onChange={(e) => setPlantIconScale(Number(e.target.value))}
          className={styles.slider}
        />
      </label>
      <hr className={styles.themeDivider} />
      <fieldset className={styles.radioGroup}>
        <legend className={styles.radioLegend}>Show labels</legend>
        {LABEL_MODES.map((m) => (
          <label key={m.value} className={styles.radioLabel}>
            <input
              type="radio"
              name="labelMode"
              checked={labelMode === m.value}
              onChange={() => setLabelMode(m.value)}
            />
            <span>{m.label}</span>
          </label>
        ))}
      </fieldset>
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
