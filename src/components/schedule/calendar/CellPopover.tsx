import { useEffect } from 'react';
import type { ResolvedAction } from '../../../model/scheduler';
import { getCultivar } from '../../../model/cultivars';
import { formatDate, formatWindow } from '../scheduleViewModel';
import type { SchedulePlantInput } from '../ScheduleView';
import styles from './CellPopover.module.css';

export type Selection =
  | { kind: 'day'; date: string; actions: ResolvedAction[] }
  | { kind: 'bar'; action: ResolvedAction };

export interface CellPopoverProps {
  selection: Selection;
  plantsById: Map<string, SchedulePlantInput>;
  onClose: () => void;
}

export function CellPopover({ selection, plantsById, onClose }: CellPopoverProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const actions = selection.kind === 'day' ? selection.actions : [selection.action];
  const title = selection.kind === 'day'
    ? formatDate(selection.date)
    : `${selection.action.label}`;

  return (
    <aside className={styles.panel} role="dialog" aria-label="Schedule details">
      <div className={styles.header}>
        <div className={styles.title}>{title}</div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className={styles.body}>
        {actions.length === 0 ? (
          <div className={styles.empty}>No actions on this day.</div>
        ) : (
          actions.map((a, i) => (
            <div key={i} className={styles.row}>
              <span className={styles.action}>{a.label}</span>
              <span className={styles.plant}>{plantLabel(plantsById, a)}</span>
              <span className={styles.window}>{formatWindow(a.earliest, a.latest)}</span>
              {a.conflicts.length > 0 && (
                <span className={styles.conflict}>! {a.conflicts.join(' · ')}</span>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function plantLabel(plantsById: Map<string, SchedulePlantInput>, a: ResolvedAction): string {
  const p = plantsById.get(a.plantId);
  if (p?.label) return p.label;
  return getCultivar(a.cultivarId)?.name ?? a.cultivarId;
}
