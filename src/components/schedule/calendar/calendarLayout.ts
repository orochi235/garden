import type { ResolvedAction } from '../../../model/scheduler';

export const MAX_VISIBLE_BARS = 3;

export interface CellPlacement {
  action: ResolvedAction;
  /** Window started before this cell. */
  continuationLeft: boolean;
  /** Window ends after this cell. */
  continuationRight: boolean;
}

export interface DayLayout {
  /** ISO 'YYYY-MM-DD'. */
  date: string;
  /** False for padding days from the previous/next month. */
  inMonth: boolean;
  /** Capped at `MAX_VISIBLE_BARS`. */
  visible: CellPlacement[];
  /** Number of actions hidden beyond the cap. */
  hiddenCount: number;
  /** Any action in this cell has a non-empty `conflicts` array. */
  hasConflict: boolean;
  isToday: boolean;
  /** Any action whose `latest` is before today. */
  isOverdue: boolean;
}

export interface MonthLayout {
  year: number;
  /** 0-indexed (matches `Date.getMonth`). */
  month: number;
  /** Always exactly 6 rows of 7 days, Sunday-first. */
  weeks: DayLayout[][];
  /** Total actions intersecting this month (sum over `inMonth` cells, capped vs hidden ignored). */
  actionCount: number;
}

/**
 * Build a 6×7 layout for the given (year, month).
 *
 * Pad days from previous/next month fill the grid edges so every row has 7
 * cells; pad days carry `inMonth: false` and an empty `visible` list (we don't
 * spill bars into pad days — they're visual placeholders for week alignment).
 */
export function layoutMonth(
  year: number,
  month: number,
  actions: readonly ResolvedAction[],
  today: string,
): MonthLayout {
  const first = new Date(year, month, 1);
  // Sunday-first: getDay() returns 0..6 where 0=Sunday. So subtract that many days.
  const gridStart = new Date(year, month, 1 - first.getDay());

  const weeks: DayLayout[][] = [];
  let actionCount = 0;
  for (let w = 0; w < 6; w++) {
    const row: DayLayout[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + w * 7 + d);
      const iso = toIso(cellDate);
      const inMonth = cellDate.getMonth() === month && cellDate.getFullYear() === year;
      if (!inMonth) {
        row.push({
          date: iso, inMonth: false, visible: [], hiddenCount: 0,
          hasConflict: false, isToday: iso === today, isOverdue: false,
        });
        continue;
      }
      const dayActions = actionsCoveringDate(actions, iso);
      actionCount += dayActions.length;
      const visible = dayActions.slice(0, MAX_VISIBLE_BARS).map((a) => ({
        action: a,
        continuationLeft: a.earliest < iso,
        continuationRight: a.latest > iso,
      }));
      const hiddenCount = Math.max(0, dayActions.length - MAX_VISIBLE_BARS);
      const hasConflict = dayActions.some((a) => a.conflicts.length > 0);
      const isOverdue = dayActions.some((a) => a.latest < today);
      row.push({
        date: iso, inMonth: true, visible, hiddenCount,
        hasConflict, isToday: iso === today, isOverdue,
      });
    }
    weeks.push(row);
  }
  return { year, month, weeks, actionCount };
}

/**
 * Compute the inclusive [startYear-Month, endYear-Month] span covering every
 * action in the schedule, then enumerate every month in that range. Used by
 * `viewScope === 'season'`.
 */
export function monthsCoveringActions(actions: readonly ResolvedAction[]): Array<{ year: number; month: number }> {
  if (actions.length === 0) return [];
  let minIso = actions[0].earliest;
  let maxIso = actions[0].latest;
  for (const a of actions) {
    if (a.earliest < minIso) minIso = a.earliest;
    if (a.latest > maxIso) maxIso = a.latest;
  }
  const start = parseIso(minIso);
  const end = parseIso(maxIso);
  const out: Array<{ year: number; month: number }> = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  // Cap to 12 months to keep the DOM bounded (gardening schedules rarely span
  // more than a single growing season; if they do, the user can scroll month-
  // by-month).
  const MAX_MONTHS = 12;
  while ((y < endY || (y === endY && m <= endM)) && out.length < MAX_MONTHS) {
    out.push({ year: y, month: m });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return out;
}

function actionsCoveringDate(actions: readonly ResolvedAction[], iso: string): ResolvedAction[] {
  const out: ResolvedAction[] = [];
  for (const a of actions) {
    const lo = a.earliest;
    const hi = a.latest < a.earliest ? a.earliest : a.latest; // clamp data bug
    if (iso >= lo && iso <= hi) out.push(a);
  }
  return out;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Today as a local ISO string. */
export function todayIso(): string {
  return toIso(new Date());
}
