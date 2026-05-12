import { useMemo, useState } from 'react';
import type { Schedule, ResolvedAction } from '../../../model/scheduler';
import type { SchedulePlantInput } from '../ScheduleView';
import { MonthGrid } from './MonthGrid';
import { CellPopover, type Selection } from './CellPopover';
import { monthsCoveringActions, todayIso } from './calendarLayout';
import type { ColorEncoding } from './barColors';
import styles from './CalendarView.module.css';

type ViewScope = 'month' | 'season';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface CalendarViewProps {
  schedule: Schedule;
  plantsById: Map<string, SchedulePlantInput>;
}

export function CalendarView({ schedule, plantsById }: CalendarViewProps) {
  const seasonMonths = useMemo(
    () => monthsCoveringActions(schedule.actions),
    [schedule.actions],
  );
  const seasonHasMultiple = seasonMonths.length > 1;

  // Default to the earliest action's month; fall back to today's month.
  const initialMonth = useMemo(() => {
    if (seasonMonths.length > 0) return seasonMonths[0];
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  }, [seasonMonths]);

  const [viewScope, setViewScope] = useState<ViewScope>('month');
  const [focused, setFocused] = useState(initialMonth);
  const [colorEncoding, setColorEncoding] = useState<ColorEncoding>('by-action');
  const [selection, setSelection] = useState<Selection | null>(null);

  const today = todayIso();

  const monthsToRender = viewScope === 'season' ? seasonMonths : [focused];

  function onSelectDay(date: string) {
    const actionsOnDay = schedule.actions.filter((a) => date >= a.earliest && date <= a.latest);
    setSelection({ kind: 'day', date, actions: actionsOnDay });
  }

  function onSelectBar(action: ResolvedAction) {
    setSelection({ kind: 'bar', action });
  }

  function prevMonth() {
    let { year, month } = focused;
    month--;
    if (month < 0) { month = 11; year--; }
    setFocused({ year, month });
  }

  function nextMonth() {
    let { year, month } = focused;
    month++;
    if (month > 11) { month = 0; year++; }
    setFocused({ year, month });
  }

  function todayMonth() {
    const t = new Date();
    setFocused({ year: t.getFullYear(), month: t.getMonth() });
  }

  if (schedule.actions.length === 0) {
    return <div className={styles.root}><div className={styles.empty}>No actions in this schedule.</div></div>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <span className={styles.scope}>
          <ScopeBtn label="Month" active={viewScope === 'month'} onClick={() => setViewScope('month')} />
          <ScopeBtn
            label="Full season"
            active={viewScope === 'season'}
            onClick={() => setViewScope('season')}
            disabled={!seasonHasMultiple}
            title={seasonHasMultiple ? '' : 'Only one month in range'}
          />
        </span>

        {viewScope === 'month' && (
          <span className={styles.nav}>
            <button type="button" className={styles.navBtn} onClick={prevMonth} aria-label="Previous month">‹</button>
            <span className={styles.navLabel}>{MONTH_NAMES[focused.month]} {focused.year}</span>
            <button type="button" className={styles.navBtn} onClick={nextMonth} aria-label="Next month">›</button>
            <button type="button" className={styles.navBtn} onClick={todayMonth}>Today</button>
          </span>
        )}

        <span className={styles.encoding}>
          <label style={{ fontSize: 12, marginRight: 4, color: 'var(--theme-text-muted, #888)' }}>Color:</label>
          <select
            className={styles.encodingSelect}
            value={colorEncoding}
            onChange={(e) => setColorEncoding(e.target.value as ColorEncoding)}
          >
            <option value="by-action">By action</option>
            <option value="by-plant">By plant</option>
            <option value="by-urgency">By urgency</option>
            <option value="mono">Mono</option>
          </select>
        </span>
      </div>

      <div className={styles.gridArea}>
        {monthsToRender.map(({ year, month }) => (
          <MonthGrid
            key={`${year}-${month}`}
            year={year}
            month={month}
            actions={schedule.actions}
            today={today}
            colorEncoding={colorEncoding}
            collapseWhenEmpty={viewScope === 'season'}
            onSelectDay={onSelectDay}
            onSelectBar={onSelectBar}
          />
        ))}
        {selection && (
          <CellPopover
            selection={selection}
            plantsById={plantsById}
            onClose={() => setSelection(null)}
          />
        )}
      </div>
    </div>
  );
}

function ScopeBtn({ label, active, onClick, disabled, title }: {
  label: string; active: boolean; onClick: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${styles.scopeBtn}${active ? ` ${styles.scopeBtnActive}` : ''}`}
    >{label}</button>
  );
}
