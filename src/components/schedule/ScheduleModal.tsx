import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { Modal } from '../modal/Modal';
import styles from './ScheduleModal.module.css';
import { ScheduleView } from './ScheduleView';

/** Garden-mode entry point: schedule for every planting + every tray seedling. */
export function ScheduleModal() {
  const setOpen = useUiStore((s) => s.setScheduleOpen);
  const garden = useGardenStore((s) => s.garden);

  const plants = [
    ...garden.plantings.map((p) => ({ id: p.id, cultivarId: p.cultivarId, label: p.label })),
    ...garden.nursery.seedlings.map((s) => ({ id: s.id, cultivarId: s.cultivarId })),
  ];
  return (
    <Modal title="Schedule" onClose={() => setOpen(false)} className={styles.dialog}>
      <ScheduleView plants={plants} />
    </Modal>
  );
}
