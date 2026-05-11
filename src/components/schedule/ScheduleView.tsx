import { useMemo, useState } from 'react';
import { buildSchedule, type Schedule } from '../../model/scheduler';
import { defaultActionsForCultivar } from '../../model/defaultActions';
import { getCultivar } from '../../model/cultivars';
import { useUiStore } from '../../store/uiStore';
import {
  groupByDate, groupByPlant, formatWindow, defaultTargetDate,
} from './scheduleViewModel';
import styles from './ScheduleView.module.css';

type ViewMode = 'flat' | 'by-date' | 'by-plant';

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
  defaultView?: ViewMode;
}

export function ScheduleView({
  plants, targetTransplantDate, lastFrostDate, firstFrostDate, defaultView = 'by-date',
}: ScheduleViewProps) {
  const almanacLastFrost = useUiStore((s) => s.almanacFilters?.lastFrostDate ?? null);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
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

  if (plants.length === 0) {
    return <div className={styles.root}><div className={styles.empty}>No plants to schedule.</div></div>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <label>
          Target transplant:&nbsp;
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </label>
        <span className={styles.toggle}>
          <ToggleBtn label="Flat" active={viewMode === 'flat'} onClick={() => setViewMode('flat')} />
          <ToggleBtn label="By date" active={viewMode === 'by-date'} onClick={() => setViewMode('by-date')} />
          <ToggleBtn label="By plant" active={viewMode === 'by-plant'} onClick={() => setViewMode('by-plant')} />
        </span>
      </div>

      {schedule.actions.length === 0 ? (
        <div className={styles.empty}>No actions in this schedule.</div>
      ) : viewMode === 'flat' ? (
        <FlatView schedule={schedule} plantsById={byId(plants)} />
      ) : viewMode === 'by-date' ? (
        <ByDateView schedule={schedule} plantsById={byId(plants)} />
      ) : (
        <ByPlantView schedule={schedule} plantsById={byId(plants)} />
      )}

      {schedule.warnings.length > 0 && (
        <div>
          {schedule.warnings.map((w, i) => <div key={i} className={styles.warning}>{w}</div>)}
        </div>
      )}
    </div>
  );
}

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.toggleBtn}${active ? ` ${styles.toggleBtnActive}` : ''}`}
    >{label}</button>
  );
}

function FlatView({ schedule, plantsById }: { schedule: Schedule; plantsById: Map<string, SchedulePlantInput> }) {
  return (
    <div className={styles.list}>
      {schedule.actions.map((a, i) => (
        <div key={i} className={styles.row}>
          <span className={styles.date}>{formatWindow(a.earliest, a.latest)}</span>
          <span className={styles.action}>{a.label}</span>
          <span className={styles.plant}>· {labelFor(plantsById, a)}</span>
          {a.conflicts.length > 0 && <span className={styles.conflict} title={a.conflicts.join('\n')}>!</span>}
        </div>
      ))}
    </div>
  );
}

function ByDateView({ schedule, plantsById }: { schedule: Schedule; plantsById: Map<string, SchedulePlantInput> }) {
  const groups = groupByDate(schedule.actions);
  return (
    <div>
      {groups.map((g) => (
        <div key={g.date} className={styles.section}>
          <div className={styles.sectionTitle}>{formatWindow(g.date, g.date)}</div>
          {g.actions.map((a, i) => (
            <div key={i} className={styles.row}>
              <span className={styles.action}>{a.label}</span>
              <span className={styles.plant}>· {labelFor(plantsById, a)}</span>
              {a.latest !== a.earliest && <span className={styles.plant}>(window ends {formatWindow(a.latest, a.latest)})</span>}
              {a.conflicts.length > 0 && <span className={styles.conflict} title={a.conflicts.join('\n')}>!</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ByPlantView({ schedule, plantsById }: { schedule: Schedule; plantsById: Map<string, SchedulePlantInput> }) {
  const groups = groupByPlant(schedule.actions);
  return (
    <div>
      {groups.map((g) => (
        <div key={g.plantId} className={styles.section}>
          <div className={styles.sectionTitle}>{labelForPlant(plantsById, g.plantId, g.cultivarId)}</div>
          {g.actions.map((a, i) => (
            <div key={i} className={styles.row}>
              <span className={styles.date}>{formatWindow(a.earliest, a.latest)}</span>
              <span className={styles.action}>{a.label}</span>
              {a.conflicts.length > 0 && <span className={styles.conflict} title={a.conflicts.join('\n')}>!</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function byId(plants: SchedulePlantInput[]): Map<string, SchedulePlantInput> {
  return new Map(plants.map((p) => [p.id, p]));
}

function labelFor(plantsById: Map<string, SchedulePlantInput>, a: { plantId: string; cultivarId: string }): string {
  const p = plantsById.get(a.plantId);
  if (p?.label) return p.label;
  return getCultivar(a.cultivarId)?.name ?? a.cultivarId;
}

function labelForPlant(plantsById: Map<string, SchedulePlantInput>, plantId: string, cultivarId: string): string {
  const p = plantsById.get(plantId);
  if (p?.label) return p.label;
  return getCultivar(cultivarId)?.name ?? cultivarId;
}

