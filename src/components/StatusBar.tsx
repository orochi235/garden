import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/StatusBar.module.css';
import { formatMeasurement } from '../utils/units';

export function StatusBar() {
  const garden = useGardenStore((s) => s.garden);
  const gridLabel = formatMeasurement(garden.gridCellSizeFt, garden.displayUnit, 0);
  const zoomPct = useUiStore((s) => s.canvasZoomPct);
  const setCanvasZoomRequest = useUiStore((s) => s.setCanvasZoomRequest);
  const selectedIds = useUiStore((s) => s.selectedIds);
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
        <button className={styles.zoomButton} onClick={() => setCanvasZoomRequest('zoom-out')}>
          −
        </button>
        <span className={styles.zoomLabel}>{zoomPct}%</span>
        <button className={styles.zoomButton} onClick={() => setCanvasZoomRequest('zoom-in')}>
          +
        </button>
        <button
          className={styles.zoomButton}
          onClick={() => setCanvasZoomRequest('reset-fit')}
          title="Fit view"
        >
          ⊙
        </button>
      </span>
      <span>{selectionLabel}</span>
    </div>
  );
}
