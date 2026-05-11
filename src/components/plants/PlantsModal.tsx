import { createPortal } from 'react-dom';
import { useUiStore } from '../../store/uiStore';
import { PlantsListView } from './PlantsListView';
import styles from './PlantsModal.module.css';

/** Detailed listview of every planting + tray seedling in the current garden. */
export function PlantsModal() {
  const setOpen = useUiStore((s) => s.setPlantsModalOpen);
  return createPortal(
    <div className={styles.backdrop} onClick={() => setOpen(false)}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Plants</h2>
          <button
            type="button"
            className={styles.close}
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>
          <PlantsListView />
        </div>
      </div>
    </div>,
    document.body,
  );
}
