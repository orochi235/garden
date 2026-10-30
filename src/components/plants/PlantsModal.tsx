import { useUiStore } from '../../store/uiStore';
import { Modal } from '../modal/Modal';
import { PlantsListView } from './PlantsListView';
import styles from './PlantsModal.module.css';

/** Detailed listview of every planting + tray seedling in the current garden. */
export function PlantsModal() {
  const setOpen = useUiStore((s) => s.setPlantsModalOpen);
  return (
    <Modal title="Plant list" onClose={() => setOpen(false)} className={styles.dialog}>
      <PlantsListView />
    </Modal>
  );
}
