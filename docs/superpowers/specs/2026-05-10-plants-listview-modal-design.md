# Plants Listview Modal — Design

## Goal

A detailed, sortable, filterable listview of every plant in a garden — plantings on the canvas plus seedlings in trays — for detailed editorial work and debugging. Triggered from a "Plants…" entry in the MenuBar; opens as a modal alongside the existing Schedule/Collection modals.

## Non-goals

- No editing of plants from this view (read-only for v1).
- No bulk operations.
- No reusable `<DataTable>` abstraction — inline implementation; extract later if a second consumer appears.

## Architecture

Mirrors the existing `ScheduleModal` pattern. All new files under `src/components/plants/`.

```
src/components/plants/
  PlantsModal.tsx               # portal + backdrop + header
  PlantsModal.module.css        # copies ScheduleModal styles; wider min-width
  PlantsListView.tsx            # toolbar + table; owns sort/filter/column state
  plantsViewModel.ts            # buildPlantRows(garden, schedule) → PlantRow[]
  plantsViewModel.test.ts
  PlantsListView.test.tsx
```

Modified files:

- `src/store/uiStore.ts` — add `plantsModalOpen: boolean` and `setPlantsModalOpen(open: boolean)`, parallel to existing `scheduleOpen`/`setScheduleOpen`.
- `src/components/App.tsx` — mount `<PlantsModal />` when `plantsModalOpen` is true (parallel to `<ScheduleModal />`).
- `src/components/MenuBar.tsx` — add `<span onClick={() => setPlantsModalOpen(true)}>Plants…</span>` next to "Schedule…".

## Data flow

`PlantsListView` subscribes to:

- `garden = useGardenStore(s => s.garden)`
- `selectedIds = useUiStore(s => s.selectedIds)`
- `setSelection = useUiStore(s => s.setSelection)`

Inside the component, in a `useMemo` keyed on `garden`:

1. Build the same enriched plants list `ScheduleView` uses (one entry per planting and per seedling, each with `actions: defaultActionsForCultivar(cultivar)`).
2. `schedule = buildSchedule({ plants, targetTransplantDate, lastFrostDate })` — target/frost dates are read from `useUiStore(s => s.almanacFilters)` the same way `ScheduleView` does, with the same fallback chain.
3. `rows = buildPlantRows(garden, schedule)` — pure function; returns one `PlantRow` per planting and per seedling.

Then the view applies, in order:

1. **Stage chip filter** — `all` | `planted` | `seedling`.
2. **Text search** — case-insensitive substring across `name`, `variety`, `location`, `cultivarId`, `id`.
3. **Sort** — by `(sortColumn, sortDir)`; default `name asc`.
4. **Render** — only the columns currently in the visible-columns set.

## Row shape

```ts
interface PlantRow {
  id: string;                  // planting.id or seedling.id
  kind: 'planting' | 'seedling';
  cultivarId: string;
  speciesId: string;
  parentId: string | null;
  name: string;                // cultivar.name; falls back to cultivarId
  variety: string | null;
  category: CultivarCategory | null;  // null when cultivar is missing
  location: string;            // parent structure/zone label, or tray label, or "—"
  stage: 'planted' | 'seedling';
  spacingFt: number | undefined;      // undefined when cultivar is missing
  heightFt: number | undefined;
  footprintFt: number | undefined;    // undefined when cultivar is missing
  climber: boolean;
  iconImage: string | null;
  x: number | null;            // planting position; null for seedlings
  y: number | null;
  nextAction: { name: string; earliest: string } | null;
  allActions: ResolvedAction[]; // for the "All scheduled actions" column
}
```

`buildPlantRows` resolves parent label via `garden.structures` / `garden.zones` for plantings and `garden.seedStarting.trays` for seedlings. Missing-cultivar plantings still produce a row with `name = cultivarId` and cultivar-derived fields left blank — so debugging surfaces orphan refs rather than hiding them.

## Columns

**Default visible (left to right):**

Icon · Name · Variety · Category · Location · Stage · Spacing · Height · Footprint · Next action

**Toggleable on (hidden by default):**

ID · Cultivar ID · Species ID · Parent ID · Position · Climber · Icon path · All scheduled actions

The column editor is a "Columns ▾" button in the table toolbar that opens a popover with a checkbox per column.

## State and persistence

- **Sort state** (`sortColumn`, `sortDir`) — `useState` inside `PlantsListView`; resets on close. A debugging session is bounded; sticky sort would surprise users on re-open.
- **Search text** — `useState`; resets on close.
- **Stage chip** — `useState`; resets on close.
- **Visible columns** — persisted to `localStorage` under key `plantsListView.visibleColumns` as a JSON string array of column IDs. Survives reloads. Parse failure falls back silently to the default visible set.

`plantsModalOpen` itself lives in `uiStore` and is *not* persisted (matches `scheduleOpen`).

## Row interaction

Clicking a row calls `setSelection([row.id])`. The modal stays mounted. The active row(s) are highlighted via `selectedIds.includes(row.id)`. No hover preview, no double-click, no context menu in v1.

## Sorting nuances

- `Next action` — sorts by `earliest` ISO date (lexicographic = chronological); empty sorts last.
- `Height`, `Footprint`, `Spacing` — numeric sort; `undefined` sorts last.
- Strings — locale-aware compare.
- `Stage` — categorical (`planted` then `seedling` in asc).

## Edge cases

- Empty garden → empty-state row: "No plants in this garden."
- Filter yields zero rows → "No plants match these filters." with a "Clear filters" button that resets stage chip + search.
- Missing cultivar → row still renders; cultivar-derived cells show `—`; `name` shows raw `cultivarId`.
- Seedling with `trayId === null` (transplanted-out history) → `location = '—'`.
- `nextAction` empty for a plant → `—`.
- `Position` column → `(x.xx, y.yy)` for plantings; `—` for seedlings.
- localStorage parse failure → fall back to default visible columns, no error surfaced.

## Testing

- `plantsViewModel.test.ts`
  - mixed plantings + seedlings produce one row each, correct `kind` and `stage`
  - parent label resolution: structure label, zone label, tray label, missing parent → `—`
  - missing-cultivar row still produced with safe fallbacks
  - `nextAction` is the earliest action for that `plantId`, or `null`
- `PlantsListView.test.tsx`
  - column header click toggles sort direction
  - search box filters across `name` + `variety` + `location`
  - stage chip switches the visible set
  - row click calls `setSelection([id])` and the modal does *not* close
  - column-editor toggle shows/hides a column and writes the updated set to `localStorage`

No dedicated `PlantsModal.test.tsx` — it is a thin portal shell, like `ScheduleModal` (which also has no test).

## Out of scope (future)

- Editing fields inline.
- Exporting rows to CSV.
- Multi-column sort.
- Saving named filter presets.
- Reusable `<DataTable>` extraction.
