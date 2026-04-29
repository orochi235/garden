import { useState } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { type CellSize, CELL_PITCH_IN, createTray } from '../model/seedStarting';
import styles from '../styles/CustomTrayBuilder.module.css';

interface Props {
  onClose: () => void;
}

export function CustomTrayBuilder({ onClose }: Props) {
  const [rows, setRows] = useState(6);
  const [cols, setCols] = useState(6);
  const [cellSize, setCellSize] = useState<CellSize>('medium');
  const [label, setLabel] = useState('Custom Tray');
  const addTray = useGardenStore((s) => s.addTray);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);

  function handleCreate() {
    const tray = createTray({ rows, cols, cellSize, label });
    addTray(tray);
    setCurrentTrayId(tray.id);
    onClose();
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Custom Tray</h3>
        <label className={styles.field}>
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            Rows
            <input type="number" min={1} max={20} value={rows}
              onChange={(e) => setRows(Math.max(1, +e.target.value))} />
          </label>
          <label className={styles.field}>
            Cols
            <input type="number" min={1} max={20} value={cols}
              onChange={(e) => setCols(Math.max(1, +e.target.value))} />
          </label>
        </div>
        <label className={styles.field}>
          Cell size
          <select value={cellSize} onChange={(e) => setCellSize(e.target.value as CellSize)}>
            <option value="small">Small (~{CELL_PITCH_IN.small}")</option>
            <option value="medium">Medium (~{CELL_PITCH_IN.medium}")</option>
            <option value="large">Large (~{CELL_PITCH_IN.large}")</option>
          </select>
        </label>
        <div className={styles.preview}>
          {rows} × {cols} = {rows * cols} cells, {(cols * CELL_PITCH_IN[cellSize]).toFixed(1)}" × {(rows * CELL_PITCH_IN[cellSize]).toFixed(1)}"
        </div>
        <div className={styles.actions}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleCreate}>Create</button>
        </div>
      </div>
    </div>
  );
}
