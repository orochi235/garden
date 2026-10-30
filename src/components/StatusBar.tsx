import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { formatMeasurement } from '../utils/units';
import styles from './StatusBar.module.css';

export function StatusBar() {
  const garden = useGardenStore((s) => s.garden);
  const gridLabel = formatMeasurement(garden.gridCellSizeFt, garden.displayUnit, 0);
  const zoomPct = useUiStore((s) => s.canvasZoomPct);
  const setCanvasZoomRequest = useUiStore((s) => s.setCanvasZoomRequest);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const appMode = useUiStore((s) => s.appMode);
  const selectionLabel =
    selectedIds.length === 0
      ? 'No selection'
      : selectedIds.length === 1
        ? '1 object selected'
        : `${selectedIds.length} objects selected`;

  return (
    <div className={styles.statusBar}>
      {appMode === 'garden' && <span>Grid: {gridLabel}</span>}
      <span className={styles.zoomControls}>
        <button
          type="button"
          className={styles.zoomButton}
          onClick={() => setCanvasZoomRequest('zoom-out')}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <span className={styles.zoomLabel}>{zoomPct}%</span>
        <button
          type="button"
          className={styles.zoomButton}
          onClick={() => setCanvasZoomRequest('zoom-in')}
          aria-label="Zoom in"
          title="Zoom in"
        >
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
