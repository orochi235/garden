import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { formatMeasurement } from '../utils/units';
import styles from '../styles/StatusBar.module.css';

export function StatusBar() {
  const garden = useGardenStore((s) => s.garden);
  const zoom = useUiStore((s) => s.zoom);
  const setZoom = useUiStore((s) => s.setZoom);
  const selectedIds = useUiStore((s) => s.selectedIds);

  const gridLabel = formatMeasurement(garden.gridCellSizeFt, garden.displayUnit, 0);
  const BASE_ZOOM = 64; // px per foot at "100%"
  const zoomPct = Math.round((zoom / BASE_ZOOM) * 100);
  const selectionLabel =
    selectedIds.length === 0
      ? 'No selection'
      : selectedIds.length === 1
        ? '1 object selected'
        : `${selectedIds.length} objects selected`;

  return (
    <div className={styles.statusBar}>
      <span>Grid: {gridLabel}</span>
      <span className={styles.zoomControls}>
        <button className={styles.zoomButton} onClick={() => setZoom(zoom * 0.8)}>−</button>
        <span className={styles.zoomLabel}>{zoomPct}%</span>
        <button className={styles.zoomButton} onClick={() => setZoom(zoom * 1.25)}>+</button>
        <button className={styles.zoomButton} onClick={() => setZoom(BASE_ZOOM)} title="Reset to 100%">⊙</button>
      </span>
      <span>{selectionLabel}</span>
    </div>
  );
}
