import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { formatMeasurement } from '../utils/units';
import styles from '../styles/StatusBar.module.css';

export function StatusBar() {
  const garden = useGardenStore((s) => s.garden);
  const zoom = useUiStore((s) => s.zoom);
  const selectedIds = useUiStore((s) => s.selectedIds);

  const gridLabel = formatMeasurement(garden.gridCellSizeFt, garden.displayUnit, 0);
  const zoomPct = Math.round(zoom * 100);
  const selectionLabel =
    selectedIds.length === 0
      ? 'No selection'
      : selectedIds.length === 1
        ? '1 object selected'
        : `${selectedIds.length} objects selected`;

  return (
    <div className={styles.statusBar}>
      <span>Grid: {gridLabel}</span>
      <span>Zoom: {zoomPct}%</span>
      <span>{selectionLabel}</span>
    </div>
  );
}
