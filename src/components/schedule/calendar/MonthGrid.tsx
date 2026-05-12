import { useMemo, useState } from 'react';
import type { ResolvedAction } from '../../../model/scheduler';
import { getCultivar } from '../../../model/cultivars';
import { layoutMonth, type DayLayout, type CellPlacement } from './calendarLayout';
import { barColor, type ColorEncoding } from './barColors';
import styles from './MonthGrid.module.css';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface MonthGridProps {
  year: number;
  /** 0-indexed. */
  month: number;
  actions: ResolvedAction[];
  today: string;
  colorEncoding: ColorEncoding;
  /** When false, an empty month renders as a collapsed strip; click expands. */
  collapseWhenEmpty?: boolean;
  onSelectDay: (date: string) => void;
  onSelectBar: (action: ResolvedAction) => void;
}

export function MonthGrid({
  year, month, actions, today, colorEncoding,
  collapseWhenEmpty = true,
  onSelectDay, onSelectBar,
}: MonthGridProps) {
  const layout = useMemo(() => layoutMonth(year, month, actions, today), [year, month, actions, today]);
  const [expanded, setExpanded] = useState(false);

  const title = `${MONTH_NAMES[month]} ${year}`;

  if (collapseWhenEmpty && layout.actionCount === 0 && !expanded) {
    return (
      <div className={styles.month}>
        <div
          className={styles.emptyMonth}
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(true); } }}
        >
          {title} — no actions (click to expand)
        </div>
      </div>
    );
  }

  return (
    <div className={styles.month}>
      <div className={styles.title}>{title}</div>
      <div className={styles.grid}>
        {WEEKDAYS.map((w) => (
          <div key={w} className={styles.weekdayHeader}>{w}</div>
        ))}
        {layout.weeks.flat().map((cell, i) => (
          <Cell
            key={i}
            cell={cell}
            today={today}
            colorEncoding={colorEncoding}
            onSelectDay={onSelectDay}
            onSelectBar={onSelectBar}
          />
        ))}
      </div>
    </div>
  );
}

interface CellProps {
  cell: DayLayout;
  today: string;
  colorEncoding: ColorEncoding;
  onSelectDay: (date: string) => void;
  onSelectBar: (action: ResolvedAction) => void;
}

function Cell({ cell, today, colorEncoding, onSelectDay, onSelectBar }: CellProps) {
  if (!cell.inMonth) {
    return <div className={`${styles.cell} ${styles.cellPad}`} />;
  }
  const day = Number(cell.date.split('-')[2]);
  const busy = cell.hiddenCount > 0;
  const classes = [
    styles.cell,
    cell.isToday && styles.cellToday,
    busy && styles.cellBusy,
    cell.isOverdue && styles.cellOverdue,
    cell.hasConflict && styles.cellConflict,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      role="button"
      tabIndex={0}
      onClick={() => onSelectDay(cell.date)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectDay(cell.date); } }}
    >
      <div className={`${styles.dayNum} ${cell.isToday ? styles.dayNumToday : ''}`}>{day}</div>
      {cell.visible.map((p, i) => (
        <Bar key={i} placement={p} today={today} colorEncoding={colorEncoding} onSelect={onSelectBar} />
      ))}
      {busy && (
        <div className={styles.busyHint} aria-label={`${cell.hiddenCount} more`}>
          +{cell.hiddenCount} more
        </div>
      )}
    </div>
  );
}

interface BarProps {
  placement: CellPlacement;
  today: string;
  colorEncoding: ColorEncoding;
  onSelect: (action: ResolvedAction) => void;
}

function Bar({ placement, today, colorEncoding, onSelect }: BarProps) {
  const { action, continuationLeft, continuationRight } = placement;
  const cultivar = getCultivar(action.cultivarId) ?? null;
  const color = barColor(colorEncoding, { action, cultivar, today });
  const overdue = action.latest < today;
  const classes = [
    styles.bar,
    overdue && styles.barOverdue,
    continuationLeft && styles.barContinueLeft,
    continuationRight && styles.barContinueRight,
  ].filter(Boolean).join(' ');
  return (
    <div
      className={classes}
      style={{ background: color.bg, color: color.fg }}
      title={action.label}
      onClick={(e) => { e.stopPropagation(); onSelect(action); }}
    >
      {continuationLeft ? '…' : ''}{action.label}{continuationRight ? '…' : ''}
    </div>
  );
}
