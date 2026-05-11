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

/**
 * Resolve a Constraint to a single ISO date. Returns null when the
 * constraint's anchor cannot be resolved (caller drops the action).
 */
export function resolveConstraint(c: Constraint, ctx: AnchorContext): string | null {
  const anchorDate = resolveAnchor(c.anchor, ctx);
  if (anchorDate === null) return null;
  if (!c.offset) return anchorDate;
  return addOffset(anchorDate, c.offset);
}

/**
 * Compute a schedule for a list of plants.
 *
 * Resolution order:
 *   1. For each plant, topologically sort its actions over `action`-anchor refs.
 *   2. For each action in order: resolve every constraint, intersect bounds.
 *   3. Sort the flat output by (earliest, plantId).
 *
 * Cycles and missing anchor data drop the affected actions and append a warning.
 */
export function buildSchedule(inputs: ScheduleInputs): Schedule {
  const today = inputs.today ?? formatToday();
  const out: ResolvedAction[] = [];
  const warnings: string[] = [];

  for (const plant of inputs.plants) {
    const sorted = topoSortActions(plant.actions);
    if (sorted.cycles.length > 0) {
      for (const cycleIds of sorted.cycles) {
        warnings.push(
          `Cycle in actions for plant ${plant.id}: ${cycleIds.join(' → ')}`,
        );
      }
    }
    const actionDates = new Map<string, string>();
    for (const a of sorted.ordered) {
      const ctx: AnchorContext = {
        targetTransplantDate: inputs.targetTransplantDate,
        lastFrostDate: inputs.lastFrostDate,
        firstFrostDate: inputs.firstFrostDate,
        today,
        actionDates,
      };
      let lower: string | null = null;
      let upper: string | null = null;
      let missing: string | null = null;
      const conflicts: string[] = [];
      for (const c of a.constraints) {
        const date = resolveConstraint(c, ctx);
        if (date === null) {
          missing = describeAnchor(c.anchor);
          break;
        }
        if (c.kind === 'lower' || c.kind === 'exact') {
          lower = maxDate(lower, date);
        }
        if (c.kind === 'upper' || c.kind === 'exact') {
          upper = minDate(upper, date);
        }
      }
      if (missing !== null) {
        warnings.push(
          `Plant ${plant.id} action "${a.id}" dropped: missing anchor ${missing}`,
        );
        continue;
      }
      if (lower === null || upper === null) {
        continue;
      }
      if (lower > upper) {
        conflicts.push(`Lower bound ${lower} is after upper bound ${upper}`);
      }
      actionDates.set(a.id, lower);
      out.push({
        plantId: plant.id,
        cultivarId: plant.cultivarId,
        actionId: a.id,
        label: a.label,
        earliest: lower,
        latest: upper,
        conflicts,
      });
    }
  }

  out.sort((a, b) => {
    if (a.earliest !== b.earliest) return a.earliest < b.earliest ? -1 : 1;
    return a.plantId < b.plantId ? -1 : a.plantId > b.plantId ? 1 : 0;
  });
  return { actions: out, warnings };
}

function topoSortActions(actions: ActionDef[]): {
  ordered: ActionDef[];
  cycles: string[][];
} {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const deps = new Map<string, Set<string>>();
  for (const a of actions) {
    const set = new Set<string>();
    for (const c of a.constraints) {
      if (c.anchor.kind === 'action' && byId.has(c.anchor.actionId)) {
        set.add(c.anchor.actionId);
      }
    }
    deps.set(a.id, set);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: ActionDef[] = [];
  const cycles: string[][] = [];

  function visit(id: string, path: string[]): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const start = path.indexOf(id);
      cycles.push(path.slice(start).concat(id));
      return;
    }
    visiting.add(id);
    for (const dep of deps.get(id) ?? new Set()) {
      visit(dep, [...path, id]);
    }
    visiting.delete(id);
    visited.add(id);
    const a = byId.get(id);
    if (a) ordered.push(a);
  }

  for (const a of actions) visit(a.id, []);

  if (cycles.length > 0) {
    const inCycle = new Set<string>(cycles.flat());
    return {
      ordered: ordered.filter((a) => !inCycle.has(a.id)),
      cycles,
    };
  }
  return { ordered, cycles: [] };
}

function describeAnchor(a: Anchor): string {
  switch (a.kind) {
    case 'target-transplant':
    case 'last-frost':
    case 'first-frost':
    case 'today':
      return a.kind;
    case 'absolute': return `absolute(${a.date})`;
    case 'action':   return `action(${a.actionId})`;
  }
}

/** Returns the later of two ISO date strings; if current is null, returns candidate. */
function maxDate(current: string | null, candidate: string): string {
  return current === null || candidate > current ? candidate : current;
}

/** Returns the earlier of two ISO date strings; if current is null, returns candidate. */
function minDate(current: string | null, candidate: string): string {
  return current === null || candidate < current ? candidate : current;
}

function formatToday(): string {
  const dt = new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function formatISO(dt: Date): string {
  return `${pad4(dt.getUTCFullYear())}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
function pad4(n: number): string { return n.toString().padStart(4, '0'); }
