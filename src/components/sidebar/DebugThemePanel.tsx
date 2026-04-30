import { useGardenStore } from '../../store/gardenStore';
import type { LabelMode } from '../../store/uiStore';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/LayerPropertiesPanel.module.css';
import { LayerSection } from './LayerSection';

const LABEL_MODES: { value: LabelMode; label: string }[] = [
  { value: 'all', label: 'All layers' },
  { value: 'active-layer', label: 'Active layer' },
  { value: 'selection', label: 'Selection' },
];

export function DebugThemePanel() {
  const debugOverlappingLabels = useUiStore((s) => s.debugOverlappingLabels);
  const setDebugOverlappingLabels = useUiStore((s) => s.setDebugOverlappingLabels);
  const labelMode = useUiStore((s) => s.labelMode);
  const setLabelMode = useUiStore((s) => s.setLabelMode);
  const labelFontSize = useUiStore((s) => s.labelFontSize);
  const setLabelFontSize = useUiStore((s) => s.setLabelFontSize);
  const plantIconScale = useUiStore((s) => s.plantIconScale);
  const setPlantIconScale = useUiStore((s) => s.setPlantIconScale);
  const loadGarden = useGardenStore((s) => s.loadGarden);
  const setCollection = useGardenStore((s) => s.setCollection);

  function handleResetGarden() {
    localStorage.removeItem('garden-planner-autosave');
    fetch(`${import.meta.env.BASE_URL}default.garden`)
      .then((r) => r.json())
      .then((g) => loadGarden(g))
      .catch(() => {});
  }

  function handleResetCollection() {
    localStorage.removeItem('garden-planner-collection');
    setCollection([]);
  }

  return (
    <LayerSection title="Debug" defaultOpen>
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
      <button
        className={styles.resetButton}
        onClick={handleResetCollection}
      >
        Reset Collection
      </button>
    </LayerSection>
  );
}
