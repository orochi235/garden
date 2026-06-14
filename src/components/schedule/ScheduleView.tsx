import { useMemo, useState } from 'react';
import { getCultivar } from '../../model/cultivars';
import { defaultActionsForCultivar } from '../../model/defaultActions';
import { buildSchedule, type Schedule } from '../../model/scheduler';
import { useUiStore } from '../../store/uiStore';
import { CalendarView } from './calendar/CalendarView';
import { ListView } from './ListView';
import { type ScheduleTab, ScheduleTabs } from './ScheduleTabs';
import styles from './ScheduleView.module.css';
import { defaultTargetDate } from './scheduleViewModel';

export interface SchedulePlantInput {
  id: string;
  cultivarId: string;
  label?: string;
}

export interface ScheduleViewProps {
  plants: SchedulePlantInput[];
  targetTransplantDate?: string;
  lastFrostDate?: string;
  firstFrostDate?: string;
  defaultTab?: ScheduleTab;
}

export function ScheduleView({
  plants,
  targetTransplantDate,
  lastFrostDate,
  firstFrostDate,
  defaultTab = 'list',
}: ScheduleViewProps) {
  const almanacLastFrost = useUiStore((s) => s.almanacFilters?.lastFrostDate ?? null);
  const [tab, setTab] = useState<ScheduleTab>(defaultTab);
  const [targetDate, setTargetDate] = useState<string>(
    targetTransplantDate ?? lastFrostDate ?? almanacLastFrost ?? defaultTargetDate(),
  );

  const schedule: Schedule = useMemo(() => {
    const enriched = plants
      .map((p) => {
        const cultivar = getCultivar(p.cultivarId);
        if (!cultivar) return null;
        return {
          id: p.id,
          cultivarId: p.cultivarId,
          label: p.label ?? cultivar.name,
          actions: defaultActionsForCultivar(cultivar),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    return buildSchedule({
      plants: enriched,
      targetTransplantDate: targetDate,
      lastFrostDate: lastFrostDate ?? almanacLastFrost ?? undefined,
      firstFrostDate,
    });
  }, [plants, targetDate, lastFrostDate, firstFrostDate, almanacLastFrost]);

  const plantsById = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);

  if (plants.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>No plants to schedule.</div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <label>
          Target transplant:&nbsp;
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </label>
      </div>

      <ScheduleTabs active={tab} onChange={setTab} />

      {schedule.actions.length === 0 ? (
        <div className={styles.empty}>No actions in this schedule.</div>
      ) : tab === 'list' ? (
        <ListView schedule={schedule} plantsById={plantsById} />
      ) : (
        <CalendarView schedule={schedule} plantsById={plantsById} />
      )}

      {schedule.warnings.length > 0 && (
        <div>
          {schedule.warnings.map((w) => (
            <div key={w} className={styles.warning}>
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
