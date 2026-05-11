# Scheduling Module Design

**Status:** approved (brainstorming) → ready for plan
**Date:** 2026-05-10

## Problem

A garden planner needs to tell the user *when* to do things — sow indoors,
pot up, harden off, transplant outside, direct sow, thin, fertilize, harvest,
and any other custom action a species/cultivar might require. The flora
database already carries timing fields (`daysToGerminate`, `weeksToTransplant`,
`weeksBeforeLastFrost`) that imply a schedule but we never expose it.

This spec covers the engine + a stub of the output UI. The custom-field /
constraint editor UI is deferred to a follow-up spec — until then, the
constraint data comes from JSON (cultivars.json or species.json) plus a
synthesizer that derives a default action set from the existing fields.

## Scope

**In:**
- A typed constraint model (`Constraint`, `Anchor`, `ActionDef`)
- A pure engine `buildSchedule(inputs): Schedule` that resolves constraints
  into dated action windows
- A default-action synthesizer that generates a starter schedule from the
  current `SeedStartingFields` (sow / transplant / harden-off when relevant)
- An embeddable `ScheduleView` React component with a flat / by-date /
  by-plant view toggle
- Entry points from tray panel, container side panel, and garden menu

**Out (deferred):**
- Custom-field / constraint editor UI
- Persisting per-cultivar overrides outside the JSON
- Calendar grid view, .ics export, recurring/conditional actions
- Weather-data triggers ("when soil temp ≥ 60°F")

## Decisions captured during brainstorming

- **Target date** is the **desired transplant-out date**, supplied by the
  user. Pre-fills from the user's last-frost date (already in
  `useUiStore.almanacFilters`) but the user can override per-schedule.
- **Anchors supported:** target-transplant (primary), absolute date,
  last-frost, first-frost, another action's date, today.
- **Range expression:** constraints are single-valued. Ranges come from
  *multiple* constraints on the same action (an `after` constraint plus a
  `before` constraint produces a window).
- **Output:** flat list, grouped-by-date, or grouped-by-plant — user picks
  via a 3-button toggle on `ScheduleView`.
- **Caller-agnostic engine:** input is `{ plants[], dates }`. Whoever calls
  it decides which plants to feed (a tray, a container, the whole garden,
  an ad-hoc selection).

## Constraint model

```ts
type Unit = 'days' | 'weeks' | 'months';

type Anchor =
  | { kind: 'target-transplant' }
  | { kind: 'last-frost' }
  | { kind: 'first-frost' }
  | { kind: 'absolute'; date: string }       // ISO 'YYYY-MM-DD'
  | { kind: 'today' }
  | { kind: 'action'; actionId: string };    // ref to another action in the same plant

interface Constraint {
  kind: 'before' | 'after' | 'on';           // 'on' = anchor exactly (no offset)
  amount?: number;                            // omitted when kind='on'
  unit?: Unit;
  anchor: Anchor;
}

interface ActionDef {
  id: string;                                 // 'sow' | 'transplant' | 'harden-off' | user-defined
  label: string;                              // 'Sow indoors'
  constraints: Constraint[];                  // multiple → engine intersects to a window
}
```

**Engine combination rules:**
- Each `before` constraint contributes an upper bound; each `after` a lower
  bound; `on` contributes both (treated as a single point).
- Action's resolved date = `[max(lower bounds), min(upper bounds)]`.
- If `lower > upper`: conflict (action emitted with `conflicts` populated;
  the schedule still renders so the user sees what's wrong).
- An action with a single `on` or single before/after constraint resolves
  to a single date (lower == upper).

**Calendar arithmetic:** `days|weeks|months` are added by ISO-calendar
arithmetic, not raw millisecond multiples — so DST and month-length
transitions don't shift things.

## Engine API

`src/model/scheduler.ts`:

```ts
interface ScheduleInputs {
  plants: Array<{
    id: string;                        // stable id for grouping (planting/seedling/etc.)
    cultivarId: string;
    label?: string;                    // human label; falls back to cultivar name
    actionsOverride?: ActionDef[];     // per-plant override; rare
  }>;
  targetTransplantDate: string;        // 'YYYY-MM-DD' — required
  lastFrostDate?: string;              // optional; falls back to caller-supplied default
  firstFrostDate?: string;
  today?: string;                      // defaults to current date
}

interface ResolvedAction {
  plantId: string;
  cultivarId: string;
  label: string;
  earliest: string;                    // 'YYYY-MM-DD'
  latest: string;                      // == earliest when single-point
  conflicts: string[];                 // empty when ok
}

interface Schedule {
  actions: ResolvedAction[];           // sorted by `earliest`
  warnings: string[];
}

function buildSchedule(inputs: ScheduleInputs): Schedule;
```

**Resolution order:**
- Topological sort over `action`-anchor refs so dependents resolve after
  their anchors. Cycles → warning + drop participating actions.
- Missing anchor data (e.g. action references `last-frost` but caller
  didn't supply it) → action dropped + warning per occurrence.

## Default action synthesis

`src/model/defaultActions.ts`:

```ts
function defaultActionsForCultivar(cultivar: Cultivar): ActionDef[];
```

Derives a starter action set from the existing `SeedStartingFields` so a
cultivar with no explicit `actions` override still produces a useful
schedule:

| Action id     | Label                | Constraints (when fields present)                                              |
|---------------|----------------------|--------------------------------------------------------------------------------|
| `sow`         | Sow indoors          | `after` last-frost by `weeksBeforeLastFrost.max` weeks (= start of window)     |
|               |                      | `before` last-frost by `weeksBeforeLastFrost.min` weeks (= end of window)      |
| `harden-off`  | Harden off           | `before` action `transplant` by 7 days (heuristic; only when `sow` was emitted)|
| `transplant`  | Transplant outdoors  | `on` target-transplant                                                          |

Cultivars whose `seedStarting.actions` is explicitly populated skip
synthesis entirely — the JSON is authoritative.

## UI: `ScheduleView` component

`src/components/schedule/ScheduleView.tsx`:

```tsx
<ScheduleView
  plants={[{ id, cultivarId, label? }, ...]}
  targetTransplantDate={...}            // optional; defaults to almanac last-frost
  lastFrostDate={...}                   // optional; defaults to almanac filters
  firstFrostDate={...}
  defaultView='by-date'                 // 'flat' | 'by-date' | 'by-plant'
/>
```

**Internal state:**
- `viewMode` — set by the 3-button toggle
- `targetDate` — owned locally; date picker at the top of the view; default
  pre-fills from the `targetTransplantDate` prop or, failing that, from
  `useUiStore.almanacFilters.lastFrostDate`. Editing this picker does *not*
  write back to the almanac filters — local-only.

**Rendering:**
- Flat: one row per `ResolvedAction`, sorted by `earliest`. Each row:
  `{date or window} • {plant label} • {action label}` plus a conflict badge
  when `conflicts.length > 0`.
- By-date: group rows by `earliest`, one section per date.
- By-plant: group rows by `plantId`, sorted within section by `earliest`.

**Conflicts:** red badge + tooltip listing the conflicting constraint
descriptions. **Warnings:** small footer with the warning strings.

## Entry points

One-liner wiring per call site, all using `<ScheduleView>`:

| Site                           | Plants source                                              |
|--------------------------------|------------------------------------------------------------|
| Tray panel                     | seedlings in the active tray                                |
| Container side panel           | plantings in that container                                 |
| Garden menu ("Schedule…")      | all plantings + all tray seedlings                          |
| (Picker / multi-select)        | deferred unless trivial                                     |

## Files

```
src/model/
  scheduler.ts                  # types + buildSchedule + cycle/topo
  scheduler.test.ts
  defaultActions.ts             # defaultActionsForCultivar(cultivar)
  defaultActions.test.ts

src/components/schedule/
  ScheduleView.tsx              # embeddable component (owns toggle + date input)
  ScheduleView.module.css
  ScheduleView.test.tsx
  scheduleViewModel.ts          # pure helpers: group-by-date, group-by-plant, format
  scheduleViewModel.test.ts
```

`scheduler.ts` doesn't import from `cultivars.ts` — it operates on
`ActionDef[]` arrays. `defaultActions.ts` is the bridge that reads
`SeedStartingFields` and emits `ActionDef[]`. Tests can exercise the
engine with hand-built actions without touching the cultivar database.

`Constraint` / `Anchor` / `ActionDef` types are re-exported from
`model/cultivars.ts` so a future `seedStarting.actions` field has
consistent typing.

## Risks

- **JSON authoring overhead.** Without the editor (deferred), adding a
  custom action means hand-editing cultivars.json. Mitigation: the default
  synthesizer covers the common case (sow / transplant / harden-off) so
  most cultivars work out of the box.
- **Calendar arithmetic edge cases.** Adding "1 month" to Jan 31 is
  ambiguous. Plan: clamp to last valid day of target month; document in
  the engine.
- **Conflicts from contradictory data.** A cultivar with
  `weeksBeforeLastFrost = [4, 6]` plus a future user-added "before today
  by 2 weeks" can produce inverted bounds. The engine surfaces these
  rather than silently picking one — the UI shows a red badge.

## Done definition

- `npx tsc -b` clean
- `npx vitest run` green (new tests in scheduler.test, defaultActions.test,
  scheduleViewModel.test, ScheduleView.test)
- Three entry points wired (tray, container, garden menu)
- Loading the demo garden, opening the schedule from the garden menu,
  shows a non-empty action list
