import { createPortal } from 'react-dom';
import { useUiStore } from '../../store/uiStore';
import { useGardenStore } from '../../store/gardenStore';
import { ScheduleView } from './ScheduleView';
import styles from './ScheduleModal.module.css';

/** Garden-mode entry point: schedule for every planting + every tray seedling. */
export function ScheduleModal() {
  const setOpen = useUiStore((s) => s.setScheduleOpen);
  const garden = useGardenStore((s) => s.garden);
  const plants = [
    ...garden.plantings.map((p) => ({ id: p.id, cultivarId: p.cultivarId, label: p.label })),
    ...garden.seedStarting.seedlings.map((s) => ({ id: s.id, cultivarId: s.cultivarId })),
  ];
  return createPortal(
    <div className={styles.backdrop} onClick={() => setOpen(false)}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Schedule</h2>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">×</button>
        </div>
        <ScheduleView plants={plants} />
      </div>
    </div>,
    document.body,
  );
}
