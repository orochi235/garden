/**
 * Scheduling engine — given plants + reference dates, produces a chronological
 * schedule of dated actions. Pure model; no React, no store imports.
 */

export type Unit = 'days' | 'weeks' | 'months';

export type Anchor =
  | { kind: 'target-transplant' }
  | { kind: 'last-frost' }
  | { kind: 'first-frost' }
  | { kind: 'absolute'; date: string }       // ISO 'YYYY-MM-DD'
  | { kind: 'today' }
  | { kind: 'action'; actionId: string };    // ref to another action in the same plant

export interface Offset {
  amount: number;                             // signed: positive = after, negative = before
  unit: Unit;
}

export interface Constraint {
  kind: 'lower' | 'upper' | 'exact';
  anchor: Anchor;
  offset?: Offset;
}

export interface ActionDef {
  id: string;
  label: string;
  constraints: Constraint[];
}

export interface ScheduleInputs {
  plants: Array<{
    id: string;
    cultivarId: string;
    label?: string;
    actions: ActionDef[];
  }>;
  targetTransplantDate: string;        // 'YYYY-MM-DD' — required
  lastFrostDate?: string;
  firstFrostDate?: string;
  today?: string;                      // defaults to current date
}

export interface ResolvedAction {
  plantId: string;
  cultivarId: string;
  actionId: string;
  label: string;
  earliest: string;                    // 'YYYY-MM-DD'
  latest: string;                      // == earliest when single-point
  conflicts: string[];                 // empty when ok
}

export interface Schedule {
  actions: ResolvedAction[];           // sorted by earliest, then by plantId
  warnings: string[];
}

/**
 * Add a signed offset to an ISO date. Calendar-aware: months use real
 * month boundaries (clamped to last valid day on overflow), days/weeks
 * are simple day arithmetic.
 */
export function addOffset(isoDate: string, offset: Offset): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (offset.unit === 'days') {
    const dt = new Date(Date.UTC(y, m - 1, d + offset.amount));
    return formatISO(dt);
  }
  if (offset.unit === 'weeks') {
    const dt = new Date(Date.UTC(y, m - 1, d + offset.amount * 7));
    return formatISO(dt);
  }
  // months: target month/year, clamp day to last valid day of that month
  const totalMonths = (y * 12 + (m - 1)) + offset.amount;
  const newY = Math.floor(totalMonths / 12);
  const newM = totalMonths - newY * 12;                // 0..11
  const lastDay = new Date(Date.UTC(newY, newM + 1, 0)).getUTCDate();
  const newD = Math.min(d, lastDay);
  return `${pad4(newY)}-${pad2(newM + 1)}-${pad2(newD)}`;
}

export interface AnchorContext {
  targetTransplantDate: string;
  lastFrostDate?: string;
  firstFrostDate?: string;
  today?: string;
  actionDates: Map<string, string>;     // actionId → already-resolved earliest date
}

/**
 * Resolve an Anchor against the supplied context. Returns null when the
 * anchor refers to data that wasn't provided (e.g. last-frost when the
 * caller didn't supply one). Caller decides how to handle: skip the
 * action and emit a warning.
 */
export function resolveAnchor(anchor: Anchor, ctx: AnchorContext): string | null {
  switch (anchor.kind) {
    case 'target-transplant': return ctx.targetTransplantDate;
    case 'last-frost':        return ctx.lastFrostDate ?? null;
    case 'first-frost':       return ctx.firstFrostDate ?? null;
    case 'absolute':          return anchor.date;
    case 'today':             return ctx.today ?? null;
    case 'action':            return ctx.actionDates.get(anchor.actionId) ?? null;
  }
}

function formatISO(dt: Date): string {
  return `${pad4(dt.getUTCFullYear())}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
function pad4(n: number): string { return n.toString().padStart(4, '0'); }
