import { useState } from 'react';
import type { Schedule } from '../../model/scheduler';
import { getCultivar } from '../../model/cultivars';
import { groupByDate, groupByPlant, formatWindow } from './scheduleViewModel';
import type { SchedulePlantInput } from './ScheduleView';
import styles from './ScheduleView.module.css';

type ListMode = 'flat' | 'by-date' | 'by-plant';

export interface ListViewProps {
  schedule: Schedule;
  plantsById: Map<string, SchedulePlantInput>;
  defaultMode?: ListMode;
}

export function ListView({ schedule, plantsById, defaultMode = 'by-date' }: ListViewProps) {
  const [mode, setMode] = useState<ListMode>(defaultMode);

  return (
    <div>
      <div className={styles.controls}>
        <span className={styles.toggle}>
          <ToggleBtn label="Flat" active={mode === 'flat'} onClick={() => setMode('flat')} />
          <ToggleBtn label="By date" active={mode === 'by-date'} onClick={() => setMode('by-date')} />
          <ToggleBtn label="By plant" active={mode === 'by-plant'} onClick={() => setMode('by-plant')} />
        </span>
      </div>

      {mode === 'flat' ? (
        <FlatList schedule={schedule} plantsById={plantsById} />
      ) : mode === 'by-date' ? (
        <ByDateList schedule={schedule} plantsById={plantsById} />
      ) : (
        <ByPlantList schedule={schedule} plantsById={plantsById} />
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

function FlatList({ schedule, plantsById }: { schedule: Schedule; plantsById: Map<string, SchedulePlantInput> }) {
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

function ByDateList({ schedule, plantsById }: { schedule: Schedule; plantsById: Map<string, SchedulePlantInput> }) {
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

function ByPlantList({ schedule, plantsById }: { schedule: Schedule; plantsById: Map<string, SchedulePlantInput> }) {
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
