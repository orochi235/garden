# Scheduling Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the constraint-based scheduling engine + a stub `ScheduleView` UI that, given a list of plants and a target transplant-out date, produces a chronological list of dated actions (sow/pot up/harden off/transplant/etc.) the user should perform.

**Architecture:** Pure-model engine (`scheduler.ts`) operates on typed `ActionDef[]` arrays — no cultivar database knowledge. A separate synthesizer (`defaultActions.ts`) bridges the existing `SeedStartingFields` → engine input. UI (`ScheduleView`) is a self-contained React component embeddable from any entry point (tray panel, container side panel, garden menu).

**Tech Stack:** TypeScript, React 19, Vitest, existing eric model types (`Cultivar`, `SeedStartingFields`).

**Spec:** `docs/superpowers/specs/2026-05-10-scheduler-design.md`

---

## File Structure

**Created:**
- `src/model/scheduler.ts` — types (`Constraint`, `Anchor`, `ActionDef`, `Schedule`, `ResolvedAction`, `ScheduleInputs`) + `buildSchedule()` engine + calendar arithmetic helpers
- `src/model/scheduler.test.ts`
- `src/model/defaultActions.ts` — `defaultActionsForCultivar(cultivar)` synthesizer
- `src/model/defaultActions.test.ts`
- `src/components/schedule/scheduleViewModel.ts` — pure helpers: `groupByDate`, `groupByPlant`, `formatDate`, `formatWindow`
- `src/components/schedule/scheduleViewModel.test.ts`
- `src/components/schedule/ScheduleView.tsx` — embeddable component
- `src/components/schedule/ScheduleView.module.css`
- `src/components/schedule/ScheduleView.test.tsx`

**Modified:**
- `src/model/cultivars.ts` — re-export `Constraint`, `Anchor`, `ActionDef` from scheduler.ts (so any future per-cultivar override has consistent typing)
- `src/components/MenuBar.tsx` — add "Schedule…" entry that opens `ScheduleView` over the whole garden
- `src/canvas/SeedStartingCanvasNewPrototype.tsx` (or its sidebar) — add a "Schedule" button on the tray panel
- `src/components/sidebar/PropertiesPanel.tsx` (or wherever container properties live) — add a "Schedule" button when a container is selected

---

## Task 1: Branch + types module

**Files:**
- Create: `src/model/scheduler.ts`
- Create: `src/model/scheduler.test.ts`

- [ ] **Step 1: Create branch**

```bash
cd /Users/mike/src/eric
git status   # confirm clean working tree
git checkout -b feat/scheduler
```

- [ ] **Step 2: Write the types-only module**

Create `src/model/scheduler.ts`:

```ts
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
```

- [ ] **Step 3: Smoke test the file imports**

Create `src/model/scheduler.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Constraint, ActionDef, ScheduleInputs, Schedule } from './scheduler';

describe('scheduler types', () => {
  it('exports the expected types', () => {
    const c: Constraint = { kind: 'exact', anchor: { kind: 'target-transplant' } };
    const a: ActionDef = { id: 'transplant', label: 'Transplant', constraints: [c] };
    const inputs: ScheduleInputs = {
      plants: [{ id: 'p1', cultivarId: 'tomato', actions: [a] }],
      targetTransplantDate: '2026-05-15',
    };
    expect(inputs.plants).toHaveLength(1);
  });
});
```

Run:

```bash
npx vitest run src/model/scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/model/scheduler.ts src/model/scheduler.test.ts
git commit -m "feat(scheduler): types module"
```

---

## Task 2: Calendar arithmetic helpers

**Files:**
- Modify: `src/model/scheduler.ts`
- Modify: `src/model/scheduler.test.ts`

- [ ] **Step 1: Write failing tests for `addOffset`**

Append to `src/model/scheduler.test.ts`:

```ts
import { addOffset } from './scheduler';

describe('addOffset', () => {
  it('adds positive days', () => {
    expect(addOffset('2026-03-01', { amount: 7, unit: 'days' })).toBe('2026-03-08');
  });

  it('subtracts negative days', () => {
    expect(addOffset('2026-03-08', { amount: -7, unit: 'days' })).toBe('2026-03-01');
  });

  it('adds weeks (= 7 days)', () => {
    expect(addOffset('2026-03-01', { amount: 2, unit: 'weeks' })).toBe('2026-03-15');
  });

  it('adds months by calendar (DST-safe)', () => {
    expect(addOffset('2026-01-15', { amount: 1, unit: 'months' })).toBe('2026-02-15');
    expect(addOffset('2026-03-31', { amount: 1, unit: 'months' })).toBe('2026-04-30'); // clamp
    expect(addOffset('2026-12-15', { amount: 1, unit: 'months' })).toBe('2027-01-15');
  });

  it('negative months subtract calendar months', () => {
    expect(addOffset('2026-03-15', { amount: -1, unit: 'months' })).toBe('2026-02-15');
    expect(addOffset('2026-03-31', { amount: -1, unit: 'months' })).toBe('2026-02-28'); // clamp
  });
});
```

Run:

```bash
npx vitest run src/model/scheduler.test.ts -t addOffset
```

Expected: FAIL — `addOffset` doesn't exist.

- [ ] **Step 2: Implement `addOffset`**

Append to `src/model/scheduler.ts`:

```ts
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

function formatISO(dt: Date): string {
  return `${pad4(dt.getUTCFullYear())}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
function pad4(n: number): string { return n.toString().padStart(4, '0'); }
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/model/scheduler.test.ts -t addOffset
```

Expected: 5 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/model/scheduler.ts src/model/scheduler.test.ts
git commit -m "feat(scheduler): calendar-aware addOffset"
```

---

## Task 3: `resolveAnchor` (anchor → date)

**Files:**
- Modify: `src/model/scheduler.ts`
- Modify: `src/model/scheduler.test.ts`

- [ ] **Step 1: Failing tests**

Append to `src/model/scheduler.test.ts`:

```ts
import { resolveAnchor } from './scheduler';

describe('resolveAnchor', () => {
  const ctx = {
    targetTransplantDate: '2026-05-15',
    lastFrostDate: '2026-04-30',
    firstFrostDate: '2026-10-15',
    today: '2026-03-01',
    actionDates: new Map<string, string>([['sow', '2026-03-08']]),
  };

  it('resolves target-transplant', () => {
    expect(resolveAnchor({ kind: 'target-transplant' }, ctx)).toBe('2026-05-15');
  });
  it('resolves last-frost', () => {
    expect(resolveAnchor({ kind: 'last-frost' }, ctx)).toBe('2026-04-30');
  });
  it('resolves first-frost', () => {
    expect(resolveAnchor({ kind: 'first-frost' }, ctx)).toBe('2026-10-15');
  });
  it('resolves absolute', () => {
    expect(resolveAnchor({ kind: 'absolute', date: '2026-07-04' }, ctx)).toBe('2026-07-04');
  });
  it('resolves today', () => {
    expect(resolveAnchor({ kind: 'today' }, ctx)).toBe('2026-03-01');
  });
  it('resolves action ref', () => {
    expect(resolveAnchor({ kind: 'action', actionId: 'sow' }, ctx)).toBe('2026-03-08');
  });
  it('returns null for missing data', () => {
    const empty = { targetTransplantDate: '2026-05-15', actionDates: new Map() };
    expect(resolveAnchor({ kind: 'last-frost' }, empty)).toBeNull();
    expect(resolveAnchor({ kind: 'action', actionId: 'sow' }, empty)).toBeNull();
  });
});
```

Run:

```bash
npx vitest run src/model/scheduler.test.ts -t resolveAnchor
```

Expected: FAIL — `resolveAnchor` not exported.

- [ ] **Step 2: Implement `resolveAnchor`**

Append to `src/model/scheduler.ts`:

```ts
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
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/model/scheduler.test.ts -t resolveAnchor
```

Expected: 7 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/model/scheduler.ts src/model/scheduler.test.ts
git commit -m "feat(scheduler): resolveAnchor"
```

---

## Task 4: `resolveConstraint` (constraint → date)

**Files:**
- Modify: `src/model/scheduler.ts`
- Modify: `src/model/scheduler.test.ts`

- [ ] **Step 1: Failing tests**

Append to `src/model/scheduler.test.ts`:

```ts
import { resolveConstraint } from './scheduler';

describe('resolveConstraint', () => {
  const ctx = {
    targetTransplantDate: '2026-05-15',
    lastFrostDate: '2026-04-30',
    actionDates: new Map<string, string>(),
  };

  it('exact constraint with no offset returns the anchor date', () => {
    expect(resolveConstraint({ kind: 'exact', anchor: { kind: 'target-transplant' } }, ctx))
      .toBe('2026-05-15');
  });

  it('lower with negative offset (4 weeks before last-frost)', () => {
    expect(resolveConstraint({
      kind: 'lower',
      anchor: { kind: 'last-frost' },
      offset: { amount: -4, unit: 'weeks' },
    }, ctx)).toBe('2026-04-02');
  });

  it('upper with negative day offset', () => {
    expect(resolveConstraint({
      kind: 'upper',
      anchor: { kind: 'target-transplant' },
      offset: { amount: -7, unit: 'days' },
    }, ctx)).toBe('2026-05-08');
  });

  it('returns null when anchor cannot be resolved', () => {
    expect(resolveConstraint({
      kind: 'exact',
      anchor: { kind: 'last-frost' },
    }, { targetTransplantDate: '2026-05-15', actionDates: new Map() })).toBe('2026-05-15');
    expect(resolveConstraint({
      kind: 'exact',
      anchor: { kind: 'first-frost' },
    }, { targetTransplantDate: '2026-05-15', actionDates: new Map() })).toBeNull();
  });
});
```

Wait, the first sub-test of "returns null" is actually expecting target-transplant which IS supplied. Let me make the assertion correct: only first-frost is missing in that ctx. Use just that case:

Replace the "returns null" `it` with:

```ts
  it('returns null when anchor cannot be resolved', () => {
    const ctxNoFirstFrost = { targetTransplantDate: '2026-05-15', actionDates: new Map<string, string>() };
    expect(resolveConstraint({
      kind: 'exact', anchor: { kind: 'first-frost' },
    }, ctxNoFirstFrost)).toBeNull();
  });
```

Run:

```bash
npx vitest run src/model/scheduler.test.ts -t resolveConstraint
```

Expected: FAIL — `resolveConstraint` not exported.

- [ ] **Step 2: Implement `resolveConstraint`**

Append to `src/model/scheduler.ts`:

```ts
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
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/model/scheduler.test.ts -t resolveConstraint
```

Expected: 4 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/model/scheduler.ts src/model/scheduler.test.ts
git commit -m "feat(scheduler): resolveConstraint"
```

---

## Task 5: `buildSchedule` engine

**Files:**
- Modify: `src/model/scheduler.ts`
- Modify: `src/model/scheduler.test.ts`

- [ ] **Step 1: Failing tests for the engine**

Append to `src/model/scheduler.test.ts`:

```ts
import { buildSchedule } from './scheduler';

describe('buildSchedule', () => {
  it('resolves a single exact action', () => {
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [{
          id: 'transplant', label: 'Transplant',
          constraints: [{ kind: 'exact', anchor: { kind: 'target-transplant' } }],
        }],
      }],
      targetTransplantDate: '2026-05-15',
    });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      plantId: 'p1', actionId: 'transplant',
      earliest: '2026-05-15', latest: '2026-05-15',
      conflicts: [],
    });
    expect(result.warnings).toEqual([]);
  });

  it('intersects lower + upper bounds into a window', () => {
    // sow 4-6 weeks before last-frost
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [{
          id: 'sow', label: 'Sow indoors',
          constraints: [
            { kind: 'lower', anchor: { kind: 'last-frost' }, offset: { amount: -6, unit: 'weeks' } },
            { kind: 'upper', anchor: { kind: 'last-frost' }, offset: { amount: -4, unit: 'weeks' } },
          ],
        }],
      }],
      targetTransplantDate: '2026-05-15',
      lastFrostDate: '2026-04-30',
    });
    expect(result.actions[0].earliest).toBe('2026-03-19');
    expect(result.actions[0].latest).toBe('2026-04-02');
  });

  it('flags conflicts when lower > upper', () => {
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [{
          id: 'sow', label: 'Sow',
          constraints: [
            { kind: 'lower', anchor: { kind: 'last-frost' }, offset: { amount: -2, unit: 'weeks' } },
            { kind: 'upper', anchor: { kind: 'last-frost' }, offset: { amount: -4, unit: 'weeks' } },
          ],
        }],
      }],
      targetTransplantDate: '2026-05-15',
      lastFrostDate: '2026-04-30',
    });
    expect(result.actions[0].conflicts.length).toBeGreaterThan(0);
  });

  it('topologically resolves action references', () => {
    // harden-off 7 days before transplant
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [
          {
            id: 'harden-off', label: 'Harden off',
            constraints: [{
              kind: 'exact',
              anchor: { kind: 'action', actionId: 'transplant' },
              offset: { amount: -7, unit: 'days' },
            }],
          },
          {
            id: 'transplant', label: 'Transplant',
            constraints: [{ kind: 'exact', anchor: { kind: 'target-transplant' } }],
          },
        ],
      }],
      targetTransplantDate: '2026-05-15',
    });
    const harden = result.actions.find((a) => a.actionId === 'harden-off')!;
    expect(harden.earliest).toBe('2026-05-08');
  });

  it('drops actions referencing missing anchors and warns', () => {
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [{
          id: 'sow', label: 'Sow',
          constraints: [{ kind: 'exact', anchor: { kind: 'last-frost' } }],
        }],
      }],
      targetTransplantDate: '2026-05-15',
      // no lastFrostDate
    });
    expect(result.actions).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('last-frost'))).toBe(true);
  });

  it('detects cycles among action refs', () => {
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [
          {
            id: 'a', label: 'A',
            constraints: [{ kind: 'exact', anchor: { kind: 'action', actionId: 'b' } }],
          },
          {
            id: 'b', label: 'B',
            constraints: [{ kind: 'exact', anchor: { kind: 'action', actionId: 'a' } }],
          },
        ],
      }],
      targetTransplantDate: '2026-05-15',
    });
    expect(result.actions).toHaveLength(0);
    expect(result.warnings.some((w) => w.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('sorts output by earliest then plantId', () => {
    const result = buildSchedule({
      plants: [
        {
          id: 'p2', cultivarId: 'basil',
          actions: [{
            id: 'sow', label: 'Sow',
            constraints: [{
              kind: 'exact', anchor: { kind: 'last-frost' },
              offset: { amount: -2, unit: 'weeks' },
            }],
          }],
        },
        {
          id: 'p1', cultivarId: 'tomato',
          actions: [{
            id: 'sow', label: 'Sow',
            constraints: [{
              kind: 'exact', anchor: { kind: 'last-frost' },
              offset: { amount: -6, unit: 'weeks' },
            }],
          }],
        },
      ],
      targetTransplantDate: '2026-05-15',
      lastFrostDate: '2026-04-30',
    });
    expect(result.actions.map((a) => a.plantId)).toEqual(['p1', 'p2']);
  });
});
```

Run:

```bash
npx vitest run src/model/scheduler.test.ts -t buildSchedule
```

Expected: FAIL — `buildSchedule` not exported.

- [ ] **Step 2: Implement `buildSchedule`**

Append to `src/model/scheduler.ts`:

```ts
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
          lower = lower === null || date > lower ? date : lower;
        }
        if (c.kind === 'upper' || c.kind === 'exact') {
          upper = upper === null || date < upper ? date : upper;
        }
      }
      if (missing !== null) {
        warnings.push(
          `Plant ${plant.id} action "${a.id}" dropped: missing anchor ${missing}`,
        );
        continue;
      }
      if (lower === null || upper === null) {
        // No constraints at all — skip silently.
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
    // Drop any action that participates in a cycle.
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

function formatToday(): string {
  const dt = new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/model/scheduler.test.ts -t buildSchedule
```

Expected: 7 PASS.

- [ ] **Step 4: Run full file to be safe**

```bash
npx vitest run src/model/scheduler.test.ts
```

Expected: all PASS (1 types smoke + 5 addOffset + 7 resolveAnchor + 4 resolveConstraint + 7 buildSchedule = 24).

- [ ] **Step 5: Commit**

```bash
git add src/model/scheduler.ts src/model/scheduler.test.ts
git commit -m "feat(scheduler): buildSchedule engine with topo sort + bounds intersection"
```

---

## Task 6: `defaultActionsForCultivar` synthesizer

**Files:**
- Create: `src/model/defaultActions.ts`
- Create: `src/model/defaultActions.test.ts`

- [ ] **Step 1: Failing tests**

Create `src/model/defaultActions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultActionsForCultivar } from './defaultActions';
import { getCultivar } from './cultivars';

describe('defaultActionsForCultivar', () => {
  it('emits sow + harden-off + transplant for a cultivar with weeksBeforeLastFrost', () => {
    // tomato.brandywine has seed-starting metadata in the builtin DB
    const c = getCultivar('tomato.brandywine');
    if (!c) throw new Error('test fixture missing');
    const actions = defaultActionsForCultivar(c);
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('transplant');
    if (c.seedStarting.weeksBeforeLastFrost !== null) {
      expect(ids).toContain('sow');
      expect(ids).toContain('harden-off');
    }
  });

  it('always emits transplant on target-transplant', () => {
    const c = getCultivar('tomato.brandywine')!;
    const actions = defaultActionsForCultivar(c);
    const transplant = actions.find((a) => a.id === 'transplant')!;
    expect(transplant.constraints).toEqual([
      { kind: 'exact', anchor: { kind: 'target-transplant' } },
    ]);
  });

  it('sow window uses weeksBeforeLastFrost.min and .max as upper/lower', () => {
    const c = getCultivar('tomato.brandywine')!;
    if (c.seedStarting.weeksBeforeLastFrost === null) {
      // Not applicable — skip.
      return;
    }
    const [min, max] = c.seedStarting.weeksBeforeLastFrost;
    const actions = defaultActionsForCultivar(c);
    const sow = actions.find((a) => a.id === 'sow')!;
    expect(sow.constraints).toContainEqual({
      kind: 'lower', anchor: { kind: 'last-frost' }, offset: { amount: -max, unit: 'weeks' },
    });
    expect(sow.constraints).toContainEqual({
      kind: 'upper', anchor: { kind: 'last-frost' }, offset: { amount: -min, unit: 'weeks' },
    });
  });

  it('harden-off is exact 7 days before transplant', () => {
    const c = getCultivar('tomato.brandywine')!;
    if (c.seedStarting.weeksBeforeLastFrost === null) return;
    const actions = defaultActionsForCultivar(c);
    const ho = actions.find((a) => a.id === 'harden-off')!;
    expect(ho.constraints).toEqual([{
      kind: 'exact',
      anchor: { kind: 'action', actionId: 'transplant' },
      offset: { amount: -7, unit: 'days' },
    }]);
  });
});
```

Run:

```bash
npx vitest run src/model/defaultActions.test.ts
```

Expected: FAIL — `defaultActions.ts` doesn't exist.

- [ ] **Step 2: Implement the synthesizer**

Create `src/model/defaultActions.ts`:

```ts
/**
 * Synthesize a default ActionDef[] for a cultivar from its existing
 * SeedStartingFields. Cultivars with explicit user-authored actions
 * (future feature) skip synthesis entirely; for now every cultivar
 * goes through this.
 */
import type { Cultivar } from './cultivars';
import type { ActionDef } from './scheduler';

export function defaultActionsForCultivar(cultivar: Cultivar): ActionDef[] {
  const actions: ActionDef[] = [];
  const ss = cultivar.seedStarting;

  // Indoor sow window — only when the cultivar declares a weeks-before range.
  if (ss.weeksBeforeLastFrost !== null) {
    const [min, max] = ss.weeksBeforeLastFrost;
    actions.push({
      id: 'sow',
      label: 'Sow indoors',
      constraints: [
        { kind: 'lower', anchor: { kind: 'last-frost' }, offset: { amount: -max, unit: 'weeks' } },
        { kind: 'upper', anchor: { kind: 'last-frost' }, offset: { amount: -min, unit: 'weeks' } },
      ],
    });
    // Heuristic: harden off 7 days before transplant when we sowed indoors.
    actions.push({
      id: 'harden-off',
      label: 'Harden off',
      constraints: [{
        kind: 'exact',
        anchor: { kind: 'action', actionId: 'transplant' },
        offset: { amount: -7, unit: 'days' },
      }],
    });
  }

  // Always emit the transplant anchor.
  actions.push({
    id: 'transplant',
    label: 'Transplant outdoors',
    constraints: [{ kind: 'exact', anchor: { kind: 'target-transplant' } }],
  });

  return actions;
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/model/defaultActions.test.ts
```

Expected: 4 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/model/defaultActions.ts src/model/defaultActions.test.ts
git commit -m "feat(scheduler): defaultActionsForCultivar synthesizer"
```

---

## Task 7: Re-export scheduler types from `cultivars.ts`

**Files:**
- Modify: `src/model/cultivars.ts`

- [ ] **Step 1: Add re-export**

Open `src/model/cultivars.ts`. At the end of its existing exports, add:

```ts
// Re-export scheduling types so any future per-cultivar `seedStarting.actions`
// override has consistent typing.
export type { Constraint, Anchor, Offset, Unit, ActionDef } from './scheduler';
```

- [ ] **Step 2: Verify tsc**

```bash
npx tsc -b 2>&1 | grep -c "error TS"
```

Expected: `0`.

- [ ] **Step 3: Commit**

```bash
git add src/model/cultivars.ts
git commit -m "feat(cultivars): re-export scheduler constraint types"
```

---

## Task 8: `scheduleViewModel` group helpers

**Files:**
- Create: `src/components/schedule/scheduleViewModel.ts`
- Create: `src/components/schedule/scheduleViewModel.test.ts`

- [ ] **Step 1: Failing tests**

Create `src/components/schedule/scheduleViewModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { groupByDate, groupByPlant, formatWindow } from './scheduleViewModel';
import type { ResolvedAction } from '../../model/scheduler';

const ACTIONS: ResolvedAction[] = [
  { plantId: 'p1', cultivarId: 'tomato', actionId: 'sow', label: 'Sow', earliest: '2026-03-19', latest: '2026-04-02', conflicts: [] },
  { plantId: 'p2', cultivarId: 'basil', actionId: 'sow', label: 'Sow', earliest: '2026-03-19', latest: '2026-03-19', conflicts: [] },
  { plantId: 'p1', cultivarId: 'tomato', actionId: 'transplant', label: 'Transplant', earliest: '2026-05-15', latest: '2026-05-15', conflicts: [] },
];

describe('groupByDate', () => {
  it('groups actions by their earliest date', () => {
    const groups = groupByDate(ACTIONS);
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe('2026-03-19');
    expect(groups[0].actions).toHaveLength(2);
    expect(groups[1].date).toBe('2026-05-15');
    expect(groups[1].actions).toHaveLength(1);
  });
});

describe('groupByPlant', () => {
  it('groups actions by plantId', () => {
    const groups = groupByPlant(ACTIONS);
    expect(groups).toHaveLength(2);
    const p1 = groups.find((g) => g.plantId === 'p1')!;
    expect(p1.actions).toHaveLength(2);
    const p2 = groups.find((g) => g.plantId === 'p2')!;
    expect(p2.actions).toHaveLength(1);
  });
});

describe('formatWindow', () => {
  it('returns a single date when earliest === latest', () => {
    expect(formatWindow('2026-05-15', '2026-05-15')).toBe('May 15');
  });
  it('returns a range when they differ', () => {
    expect(formatWindow('2026-03-19', '2026-04-02')).toBe('Mar 19 – Apr 2');
  });
});
```

Run:

```bash
npx vitest run src/components/schedule/scheduleViewModel.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 2: Implement**

Create `src/components/schedule/scheduleViewModel.ts`:

```ts
import type { ResolvedAction } from '../../model/scheduler';

export interface DateGroup {
  date: string;
  actions: ResolvedAction[];
}

export interface PlantGroup {
  plantId: string;
  cultivarId: string;
  actions: ResolvedAction[];
}

/**
 * Group actions by their `earliest` date. Input is assumed already sorted
 * by the engine (earliest, then plantId).
 */
export function groupByDate(actions: ResolvedAction[]): DateGroup[] {
  const out: DateGroup[] = [];
  let current: DateGroup | null = null;
  for (const a of actions) {
    if (!current || current.date !== a.earliest) {
      current = { date: a.earliest, actions: [] };
      out.push(current);
    }
    current.actions.push(a);
  }
  return out;
}

/**
 * Group actions by plantId. Within each group, actions stay in their
 * original (chronological) order.
 */
export function groupByPlant(actions: ResolvedAction[]): PlantGroup[] {
  const byId = new Map<string, PlantGroup>();
  for (const a of actions) {
    let group = byId.get(a.plantId);
    if (!group) {
      group = { plantId: a.plantId, cultivarId: a.cultivarId, actions: [] };
      byId.set(a.plantId, group);
    }
    group.actions.push(a);
  }
  return [...byId.values()];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format an ISO date as "Mon D" (year omitted; the schedule UI carries year context). */
export function formatDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}`;
}

/** "Mon D" when earliest === latest, otherwise "Mon D – Mon D". */
export function formatWindow(earliest: string, latest: string): string {
  if (earliest === latest) return formatDate(earliest);
  return `${formatDate(earliest)} – ${formatDate(latest)}`;
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/components/schedule/scheduleViewModel.test.ts
```

Expected: 4 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/scheduleViewModel.ts src/components/schedule/scheduleViewModel.test.ts
git commit -m "feat(schedule): view-model group helpers + window formatter"
```

---

## Task 9: `ScheduleView` component

**Files:**
- Create: `src/components/schedule/ScheduleView.tsx`
- Create: `src/components/schedule/ScheduleView.module.css`
- Create: `src/components/schedule/ScheduleView.test.tsx`

- [ ] **Step 1: Failing test**

Create `src/components/schedule/ScheduleView.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScheduleView } from './ScheduleView';

describe('ScheduleView', () => {
  it('renders nothing meaningful when no plants supplied', () => {
    render(<ScheduleView plants={[]} targetTransplantDate="2026-05-15" />);
    expect(screen.getByText(/no plants/i)).toBeDefined();
  });

  it('renders a transplant action for a single tomato plant', () => {
    render(
      <ScheduleView
        plants={[{ id: 'p1', cultivarId: 'tomato.brandywine', label: 'My Brandywine' }]}
        targetTransplantDate="2026-05-15"
        lastFrostDate="2026-04-30"
      />,
    );
    // Default view is by-date; "Transplant outdoors" should appear somewhere.
    expect(screen.getByText(/transplant outdoors/i)).toBeDefined();
    expect(screen.getByText(/my brandywine/i)).toBeDefined();
  });

  it('toggles between flat / by-date / by-plant views', () => {
    const { container } = render(
      <ScheduleView
        plants={[{ id: 'p1', cultivarId: 'tomato.brandywine' }]}
        targetTransplantDate="2026-05-15"
        lastFrostDate="2026-04-30"
      />,
    );
    // Three view-mode buttons by accessible name.
    expect(screen.getByRole('button', { name: /flat/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /by date/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /by plant/i })).toBeDefined();
    expect(container).toBeDefined();
  });
});
```

Run:

```bash
npx vitest run src/components/schedule/ScheduleView.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 2: Stub the CSS module**

Create `src/components/schedule/ScheduleView.module.css`:

```css
.root { display: flex; flex-direction: column; gap: 8px; padding: 8px; font-size: 14px; }
.controls { display: flex; gap: 6px; align-items: center; }
.toggle { display: inline-flex; gap: 0; }
.toggleBtn { padding: 4px 8px; border: 1px solid #888; background: #fff; cursor: pointer; }
.toggleBtnActive { background: #555; color: #fff; }
.list { display: flex; flex-direction: column; gap: 4px; }
.row { display: flex; gap: 8px; align-items: baseline; }
.date { font-variant-numeric: tabular-nums; min-width: 8em; color: #444; }
.action { font-weight: 500; }
.plant { color: #666; }
.conflict { color: #c33; margin-left: 4px; }
.section { display: flex; flex-direction: column; gap: 2px; padding-bottom: 6px; }
.sectionTitle { font-weight: 600; color: #333; margin-bottom: 2px; }
.warning { color: #c33; font-size: 12px; }
.empty { color: #888; font-style: italic; }
```

- [ ] **Step 3: Implement the component**

Create `src/components/schedule/ScheduleView.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { buildSchedule, type Schedule } from '../../model/scheduler';
import { defaultActionsForCultivar } from '../../model/defaultActions';
import { getCultivar } from '../../model/cultivars';
import { useUiStore } from '../../store/uiStore';
import {
  groupByDate, groupByPlant, formatWindow,
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

function defaultTargetDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 2);          // ~ 2 months from today
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/schedule/ScheduleView.test.tsx
```

Expected: 3 PASS.

- [ ] **Step 5: Verify tsc + run full suite**

```bash
npx tsc -b 2>&1 | grep -c "error TS"
npx vitest run 2>&1 | tail -5
```

Expected: tsc returns `0`; vitest reports 24 (scheduler) + 4 (defaults) + 4 (viewModel) + 3 (ScheduleView) = 35 new tests, all PASS, with whatever the previous total was.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/
git commit -m "feat(schedule): ScheduleView component (flat / by-date / by-plant toggle)"
```

---

## Task 10: Wire entry point — Garden menu

**Files:**
- Modify: `src/components/MenuBar.tsx`

- [ ] **Step 1: Read existing menu**

Open `src/components/MenuBar.tsx`. Find a menu item or section where you can add a "Schedule…" entry. Look for an existing modal-trigger pattern (e.g. `setCollectionEditorOpen(true)`).

- [ ] **Step 2: Add a `scheduleOpen` ui flag**

Open `src/store/uiStore.ts`. Add to the state:

```ts
scheduleOpen: boolean;
```

with default `false`, and add a setter:

```ts
setScheduleOpen: (open: boolean) => void;
```

implemented as `setScheduleOpen: (open) => set({ scheduleOpen: open }),`.

- [ ] **Step 3: Add the menu trigger**

In `src/components/MenuBar.tsx`, near the existing `Collection…` entry, add:

```tsx
const setScheduleOpen = useUiStore((s) => s.setScheduleOpen);
// ...
<span onClick={() => setScheduleOpen(true)}>Schedule…</span>
```

(Match the surrounding markup style — if it's a button, use a button.)

- [ ] **Step 4: Render the modal at the App root**

Open `src/components/App.tsx`. Below the existing modals (collection editor etc.), add:

```tsx
{useUiStore((s) => s.scheduleOpen) && <ScheduleModal />}
```

with the import:

```ts
import { ScheduleModal } from './schedule/ScheduleModal';
```

- [ ] **Step 5: Create `ScheduleModal`**

Create `src/components/schedule/ScheduleModal.tsx`:

```tsx
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
```

Create `src/components/schedule/ScheduleModal.module.css`:

```css
.backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
}
.dialog {
  background: #fff; border-radius: 6px; min-width: 560px; max-width: 800px;
  max-height: 80vh; overflow: auto; display: flex; flex-direction: column;
}
.header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #ddd; }
.title { margin: 0; font-size: 18px; }
.close { background: none; border: none; font-size: 22px; cursor: pointer; line-height: 1; }
```

- [ ] **Step 6: Verify tsc + smoke**

```bash
npx tsc -b 2>&1 | grep -c "error TS"
npx vitest run 2>&1 | tail -5
```

Expected: tsc `0`; vitest still green.

- [ ] **Step 7: Commit**

```bash
git add src/components/MenuBar.tsx src/components/App.tsx src/components/schedule/ScheduleModal.tsx src/components/schedule/ScheduleModal.module.css src/store/uiStore.ts
git commit -m "feat(schedule): garden-menu entry point — Schedule modal over whole garden"
```

---

## Task 11: Wire entry point — Tray panel

**Files:**
- Modify: `src/components/FloatingTraySwitcher.tsx` (or wherever the active tray's controls live; check for existing tray controls)

- [ ] **Step 1: Locate the active-tray panel**

```bash
grep -rn "currentTrayId\|activeTrayId" src/components/ --include="*.tsx" | head -5
```

Pick the component that already shows the active tray's name / controls — probably `FloatingTraySwitcher` or `TraySwitcher`. Read it to understand the layout pattern.

- [ ] **Step 2: Add a "Schedule" button in that component**

Add a button (matching the existing button style) that, when clicked, opens a `ScheduleView` for the seedlings in the active tray.

Two options for displaying the schedule:
1. Inline expansion (drawer/popover below the tray switcher)
2. Modal — set `ui.scheduleOpen = true` AND store the tray's seedling list in a transient slot the modal reads

Option 1 is lower scope. Implement it as an expandable section. State:

```tsx
const [scheduleOpen, setScheduleOpen] = useState(false);
const tray = /* existing active-tray lookup */;
const seedlings = useGardenStore((s) =>
  s.garden.seedStarting.seedlings.filter((sd) => sd.trayId === tray?.id)
);
const plants = seedlings.map((sd) => ({ id: sd.id, cultivarId: sd.cultivarId }));
// ...
<button type="button" onClick={() => setScheduleOpen((v) => !v)}>Schedule</button>
{scheduleOpen && <ScheduleView plants={plants} />}
```

Match the surrounding component's import style and CSS.

- [ ] **Step 3: Verify**

```bash
npx tsc -b 2>&1 | grep -c "error TS"
npx vitest run 2>&1 | tail -5
```

Expected: tsc `0`; vitest still green.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat(schedule): tray-panel entry point — schedule the seedlings in the active tray"
```

---

## Task 12: Wire entry point — Container side panel

**Files:**
- Modify: `src/components/sidebar/PropertiesPanel.tsx` (or whichever panel shows when a single container is selected; check)

- [ ] **Step 1: Locate the container properties panel**

```bash
grep -rn "selectedIds\|selectedStructureId\|selectedContainer" src/components/sidebar/*.tsx | head -10
```

Find the panel that shows when a single container is selected. Read it.

- [ ] **Step 2: Add a "Schedule" button**

Where the panel renders its container-specific controls, add:

```tsx
const [scheduleOpen, setScheduleOpen] = useState(false);
const garden = useGardenStore((s) => s.garden);
const plantings = garden.plantings.filter((p) => p.parentId === selectedId);
const plants = plantings.map((p) => ({ id: p.id, cultivarId: p.cultivarId, label: p.label }));
// ...
{plants.length > 0 && (
  <>
    <button type="button" onClick={() => setScheduleOpen((v) => !v)}>Schedule</button>
    {scheduleOpen && <ScheduleView plants={plants} />}
  </>
)}
```

Match surrounding style.

- [ ] **Step 3: Verify**

```bash
npx tsc -b 2>&1 | grep -c "error TS"
npx vitest run 2>&1 | tail -5
```

Expected: tsc `0`; vitest still green.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat(schedule): container side-panel entry point — schedule the container's plantings"
```

---

## Task 13: Final integration check

**Files:** none (verification + merge prep)

- [ ] **Step 1: Clean typecheck**

```bash
npx tsc -b 2>&1 | grep -c "error TS"
```

Expected: `0`.

- [ ] **Step 2: All unit tests green**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: all green; total = previous + ~38 new (24 scheduler + 4 defaults + 4 viewModel + 3 ScheduleView + tests added incidentally for entry points).

- [ ] **Step 3: Lint clean (or no NEW lint errors)**

```bash
npm run lint 2>&1 | tail -3
```

Expected: no new errors in any of the new files.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Open `http://localhost:53305/garden/`:

1. **Garden menu** — open the "Schedule…" entry. Modal appears. Default view is "by-date". Action list is non-empty if your garden has plantings or tray seedlings. Toggle to "Flat" and "By plant" — content re-arranges.
2. **Tray panel** — switch to seed-starting mode, pick a tray with seedlings, click Schedule. Inline schedule shows.
3. **Container panel** — select a raised-bed with plantings, click Schedule. Inline schedule shows.
4. Change the target-transplant date in any of the three. All actions recompute relative to it.

If anything's wrong, fix it in this task.

- [ ] **Step 5: Branch ready for review**

```bash
git log --oneline main..HEAD
```

Hand back to the user for review and merge — DO NOT auto-merge.

---

## Self-Review Notes (author's running checklist)

**Spec coverage:**
- ✓ Constraint model: types in Task 1; semantics tested in Tasks 2-5
- ✓ Engine `buildSchedule`: Task 5 (topo, bounds, conflicts, missing-anchor warnings, sort)
- ✓ Default action synthesis: Task 6
- ✓ View model helpers: Task 8
- ✓ `ScheduleView` component (toggle, date picker, conflict badges, warnings): Task 9
- ✓ Three entry points (garden menu, tray, container): Tasks 10/11/12
- ✓ Re-export of constraint types from `cultivars.ts`: Task 7
- ✓ Done definition matches spec

**Type consistency:**
- `Constraint`/`Anchor`/`Offset`/`ActionDef` defined in scheduler.ts (Task 1) and consumed by every later task without renaming
- `ResolvedAction.actionId` matches the field used in tests (Task 5) and view-model (Task 8)
- `ScheduleInputs.plants[].actions` (full ActionDef[]) used consistently in Tasks 5 and 9

**Risks called out in spec:**
- ✓ Calendar arithmetic edge cases — Task 2 tests month clamping (Jan 31 + 1 month → Feb 28)
- ✓ Conflicts — Task 5 tests inverted-bounds detection; Task 9 renders the conflict badge
- ✓ JSON authoring overhead — Tasks 6+9 use the synthesizer so most cultivars just work
