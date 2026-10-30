import { useState } from 'react';
import { CELL_PITCH_IN, type CellSize, createTray } from '../model/nursery';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import styles from './CustomTrayBuilder.module.css';
import { Modal, modalStyles } from './modal/Modal';

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
    <Modal
      title="Custom Tray"
      onClose={onClose}
      className={styles.dialog}
      actions={
        <>
          <button type="button" className={modalStyles.button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${modalStyles.button} ${modalStyles.primary}`}
            onClick={handleCreate}
          >
            Create
          </button>
        </>
      }
    >
      <div className={styles.form}>
        <label className={styles.field}>
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            Rows
            <input
              type="number"
              min={1}
              max={20}
              value={rows}
              onChange={(e) => setRows(Math.max(1, +e.target.value))}
            />
          </label>
          <label className={styles.field}>
            Cols
            <input
              type="number"
              min={1}
              max={20}
              value={cols}
              onChange={(e) => setCols(Math.max(1, +e.target.value))}
            />
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
          {rows} × {cols} = {rows * cols} cells, {(cols * CELL_PITCH_IN[cellSize]).toFixed(1)}" ×{' '}
          {(rows * CELL_PITCH_IN[cellSize]).toFixed(1)}"
        </div>
      </div>
    </Modal>
  );
}
