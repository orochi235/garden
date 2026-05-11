# Plants Listview Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sortable, filterable detailed listview of every plant in a garden (plantings + tray seedlings), opened from a "Plants…" MenuBar entry as a modal.

**Architecture:** Mirrors the existing `ScheduleModal` pattern under `src/components/plants/`. A pure `plantsViewModel` builds row records from `garden` state plus the scheduler output; `PlantsListView` owns sort/filter/column-editor state; `PlantsModal` is a thin portal shell. Modal open/close lives in `uiStore`; column visibility persists to `localStorage`.

**Tech Stack:** React 18 + TypeScript, Zustand, vitest + `@testing-library/react`. CSS modules. Project test runner: `npm test`. Lint: `npm run lint`.

---

## Reference: spec

See `docs/superpowers/specs/2026-05-10-plants-listview-modal-design.md`.

## Reference: existing patterns to mirror

- `src/components/schedule/ScheduleModal.tsx` — portal shell pattern (backdrop + dialog + close + `createPortal`).
- `src/components/schedule/ScheduleModal.module.css` — modal styling.
- `src/components/schedule/ScheduleView.tsx` (lines 36-55) — how to build the `plants` input for `buildSchedule`.
- `src/store/uiStore.ts` (lines 185-187, 304, 373) — `scheduleOpen` shape to mirror.
- `src/components/App.tsx` (lines 40, 272) — modal mount pattern.
- `src/components/MenuBar.tsx` (line 74) — MenuBar entry pattern.

---

## File Structure

**New files:**

- `src/components/plants/PlantsModal.tsx` — portal + backdrop + header.
- `src/components/plants/PlantsModal.module.css` — adapted from `ScheduleModal.module.css`, wider min-width.
- `src/components/plants/PlantsListView.tsx` — toolbar + table; owns sort/filter/column state.
- `src/components/plants/PlantsListView.module.css` — table + toolbar styling.
- `src/components/plants/plantsViewModel.ts` — `buildPlantRows(garden, schedule)` and `PlantRow` type.
- `src/components/plants/plantsViewModel.test.ts`
- `src/components/plants/PlantsListView.test.tsx`

**Modified files:**

- `src/store/uiStore.ts` — add `plantsModalOpen` + `setPlantsModalOpen`.
- `src/components/App.tsx` — mount `<PlantsModal />` when open.
- `src/components/MenuBar.tsx` — add "Plants…" entry.

---

## Task 1: Add `plantsModalOpen` to uiStore

**Files:**
- Modify: `src/store/uiStore.ts`
- Test: `src/store/uiStore.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/store/uiStore.test.ts` (inside the existing `describe('uiStore', ...)` block):

```ts
  it('toggles plantsModalOpen', () => {
    expect(useUiStore.getState().plantsModalOpen).toBe(false);
    useUiStore.getState().setPlantsModalOpen(true);
    expect(useUiStore.getState().plantsModalOpen).toBe(true);
    useUiStore.getState().setPlantsModalOpen(false);
    expect(useUiStore.getState().plantsModalOpen).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- uiStore.test`
Expected: FAIL — `plantsModalOpen`/`setPlantsModalOpen` not defined.

- [ ] **Step 3: Add field to interface and default state**

In `src/store/uiStore.ts`, immediately after the existing `scheduleOpen: boolean;` line in the `UiStore` interface, add:

```ts
  plantsModalOpen: boolean;
```

And immediately after the existing `setScheduleOpen: (open: boolean) => void;` declaration in the same interface, add:

```ts
  setPlantsModalOpen: (open: boolean) => void;
```

In `defaultState()`, immediately after the `scheduleOpen: false,` line, add:

```ts
    plantsModalOpen: false,
```

In the store factory (`create<UiStore>(...)`), immediately after the `setScheduleOpen: (open) => set({ scheduleOpen: open }),` line, add:

```ts
  setPlantsModalOpen: (open) => set({ plantsModalOpen: open }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- uiStore.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/uiStore.ts src/store/uiStore.test.ts
git commit -m "feat(ui-store): add plantsModalOpen flag"
```

---

## Task 2: `plantsViewModel.ts` — `buildPlantRows` skeleton + plantings

**Files:**
- Create: `src/components/plants/plantsViewModel.ts`
- Test: `src/components/plants/plantsViewModel.test.ts`

This task builds the `PlantRow` type and handles plantings only. Seedlings come in Task 3.

- [ ] **Step 1: Write the failing test**

Create `src/components/plants/plantsViewModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPlantRows } from './plantsViewModel';
import { createGarden, createStructure, createPlanting } from '../../model/types';
import { getAllCultivars } from '../../model/cultivars';

function gardenWithOnePlanting() {
  const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
  const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
  bed.label = 'Bed A';
  garden.structures.push(bed);
  const cv = getAllCultivars()[0];
  const planting = createPlanting({ parentId: bed.id, x: 1, y: 1, cultivarId: cv.id });
  garden.plantings.push(planting);
  return { garden, bed, planting, cv };
}

describe('buildPlantRows', () => {
  it('emits a row for each planting with kind="planting"', () => {
    const { garden, planting, bed, cv } = gardenWithOnePlanting();
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe(planting.id);
    expect(row.kind).toBe('planting');
    expect(row.cultivarId).toBe(cv.id);
    expect(row.parentId).toBe(bed.id);
    expect(row.location).toBe('Bed A');
    expect(row.stage).toBe('planted');
    expect(row.name).toBe(cv.name);
    expect(row.x).toBe(1);
    expect(row.y).toBe(1);
  });

  it('falls back to cultivarId for missing cultivar but still emits row', () => {
    const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    garden.structures.push(bed);
    garden.plantings.push({
      id: 'p1', parentId: bed.id, cultivarId: 'does-not-exist',
      x: 0, y: 0, label: 'x', icon: null,
    });
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('does-not-exist');
    expect(rows[0].variety).toBeNull();
  });

  it('resolves zone label as location when parent is a zone', () => {
    const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    const zone = { id: 'z1', x: 0, y: 0, width: 5, length: 5, color: '#fff',
      label: 'Zone X', zIndex: 0, parentId: null, soilType: null, sunExposure: null,
      layout: null, pattern: null };
    garden.zones.push(zone);
    const cv = getAllCultivars()[0];
    garden.plantings.push(createPlanting({ parentId: 'z1', x: 0, y: 0, cultivarId: cv.id }));
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows[0].location).toBe('Zone X');
  });

  it('uses "—" when parent cannot be found', () => {
    const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    const cv = getAllCultivars()[0];
    garden.plantings.push(createPlanting({ parentId: 'ghost', x: 0, y: 0, cultivarId: cv.id }));
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows[0].location).toBe('—');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- plantsViewModel`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `plantsViewModel.ts`**

Create `src/components/plants/plantsViewModel.ts`:

```ts
import type { Garden } from '../../model/types';
import { getCultivar, type CultivarCategory } from '../../model/cultivars';
import type { ResolvedAction, Schedule } from '../../model/scheduler';

export interface PlantRow {
  id: string;
  kind: 'planting' | 'seedling';
  cultivarId: string;
  speciesId: string;
  parentId: string | null;
  name: string;
  variety: string | null;
  category: CultivarCategory | null;
  location: string;
  stage: 'planted' | 'seedling';
  spacingFt: number | undefined;
  heightFt: number | undefined;
  footprintFt: number | undefined;
  climber: boolean;
  iconImage: string | null;
  x: number | null;
  y: number | null;
  nextAction: { name: string; earliest: string } | null;
  allActions: ResolvedAction[];
}

function parentLabel(garden: Garden, parentId: string | null): string {
  if (!parentId) return '—';
  const struct = garden.structures.find((s) => s.id === parentId);
  if (struct) return struct.label || struct.type;
  const zone = garden.zones.find((z) => z.id === parentId);
  if (zone) return zone.label || 'zone';
  return '—';
}

function actionsForPlant(schedule: Pick<Schedule, 'actions'>, plantId: string): ResolvedAction[] {
  return schedule.actions.filter((a) => a.plantId === plantId);
}

function nextActionFor(actions: ResolvedAction[]): { name: string; earliest: string } | null {
  if (actions.length === 0) return null;
  // schedule.actions is pre-sorted by earliest; first match is the next action.
  const a = actions[0];
  return { name: a.actionName ?? a.actionId ?? 'action', earliest: a.earliest };
}

export function buildPlantRows(
  garden: Garden,
  schedule: Pick<Schedule, 'actions'>,
): PlantRow[] {
  const rows: PlantRow[] = [];

  for (const p of garden.plantings) {
    const cv = getCultivar(p.cultivarId);
    const actions = actionsForPlant(schedule, p.id);
    rows.push({
      id: p.id,
      kind: 'planting',
      cultivarId: p.cultivarId,
      speciesId: cv?.speciesId ?? '',
      parentId: p.parentId,
      name: cv?.name ?? p.cultivarId,
      variety: cv?.variety ?? null,
      category: cv?.category ?? null,
      location: parentLabel(garden, p.parentId),
      stage: 'planted',
      spacingFt: cv?.spacingFt,
      heightFt: cv?.heightFt,
      footprintFt: cv?.footprintFt,
      climber: cv?.climber ?? false,
      iconImage: cv?.iconImage ?? null,
      x: p.x,
      y: p.y,
      nextAction: nextActionFor(actions),
      allActions: actions,
    });
  }

  return rows;
}
```

Note: `ResolvedAction.actionName`/`actionId` field names assume the scheduler types — confirm against `src/model/scheduler.ts` lines 46-55 when implementing; adjust to whatever the existing field is (e.g., `action` or `name`).

- [ ] **Step 4: Verify scheduler field name and adjust if necessary**

Run: `grep -n "interface ResolvedAction" src/model/scheduler.ts && sed -n '46,60p' src/model/scheduler.ts`
Expected: lists the fields of `ResolvedAction`. If the action's display name lives under a different field than `actionName`/`actionId` (for example `action`, `name`, or `type`), update the two reads inside `nextActionFor` to match. Use whichever single field is the canonical human-readable action label.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- plantsViewModel`
Expected: PASS for all four tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/plants/plantsViewModel.ts src/components/plants/plantsViewModel.test.ts
git commit -m "feat(plants): plantsViewModel for plantings"
```

---

## Task 3: `plantsViewModel.ts` — seedling rows

**Files:**
- Modify: `src/components/plants/plantsViewModel.ts`
- Test: `src/components/plants/plantsViewModel.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plantsViewModel.test.ts` (inside the same `describe`):

```ts
  it('emits a row per seedling with kind="seedling" and tray label as location', () => {
    const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    const cv = getAllCultivars()[0];
    garden.seedStarting.trays.push({
      id: 'tray1', label: 'Tray North', rows: 2, cols: 2,
      cellSize: 'medium', cellPitchIn: 1.5, widthIn: 10, heightIn: 10,
      slots: [
        { state: 'sown', seedlingId: 's1' },
        { state: 'empty', seedlingId: null },
        { state: 'empty', seedlingId: null },
        { state: 'empty', seedlingId: null },
      ],
    });
    garden.seedStarting.seedlings.push({
      id: 's1', cultivarId: cv.id, trayId: 'tray1',
      row: 0, col: 0, labelOverride: null,
    });
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('seedling');
    expect(rows[0].id).toBe('s1');
    expect(rows[0].stage).toBe('seedling');
    expect(rows[0].location).toBe('Tray North');
    expect(rows[0].x).toBeNull();
    expect(rows[0].y).toBeNull();
  });

  it('renders location as "—" for seedling without a tray', () => {
    const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    const cv = getAllCultivars()[0];
    garden.seedStarting.seedlings.push({
      id: 's1', cultivarId: cv.id, trayId: null,
      row: null, col: null, labelOverride: null,
    });
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows[0].location).toBe('—');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- plantsViewModel`
Expected: FAIL — only planting rows emitted; seedling tests show "expected length 1, got 0".

- [ ] **Step 3: Implement seedling emission**

In `src/components/plants/plantsViewModel.ts`, immediately before the `return rows;` at the bottom of `buildPlantRows`, append:

```ts
  for (const s of garden.seedStarting.seedlings) {
    const cv = getCultivar(s.cultivarId);
    const actions = actionsForPlant(schedule, s.id);
    const tray = s.trayId ? garden.seedStarting.trays.find((t) => t.id === s.trayId) : null;
    rows.push({
      id: s.id,
      kind: 'seedling',
      cultivarId: s.cultivarId,
      speciesId: cv?.speciesId ?? '',
      parentId: s.trayId,
      name: cv?.name ?? s.cultivarId,
      variety: cv?.variety ?? null,
      category: cv?.category ?? null,
      location: tray?.label ?? '—',
      stage: 'seedling',
      spacingFt: cv?.spacingFt,
      heightFt: cv?.heightFt,
      footprintFt: cv?.footprintFt,
      climber: cv?.climber ?? false,
      iconImage: cv?.iconImage ?? null,
      x: null,
      y: null,
      nextAction: nextActionFor(actions),
      allActions: actions,
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- plantsViewModel`
Expected: PASS for all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/components/plants/plantsViewModel.ts src/components/plants/plantsViewModel.test.ts
git commit -m "feat(plants): plantsViewModel includes tray seedlings"
```

---

## Task 4: `PlantsModal.tsx` — portal shell

**Files:**
- Create: `src/components/plants/PlantsModal.tsx`
- Create: `src/components/plants/PlantsModal.module.css`

No test for the shell — `ScheduleModal` also has none. Real test coverage is in Task 5+ for `PlantsListView`.

- [ ] **Step 1: Create CSS module**

Create `src/components/plants/PlantsModal.module.css`:

```css
.backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
}
.dialog {
  background: #fff; border-radius: 6px; min-width: 880px; max-width: 1200px;
  max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;
}
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #ddd;
}
.title { margin: 0; font-size: 18px; }
.close {
  background: none; border: none; font-size: 22px; cursor: pointer; line-height: 1;
}
.body { flex: 1; overflow: auto; }
```

- [ ] **Step 2: Create `PlantsModal.tsx`**

Create `src/components/plants/PlantsModal.tsx`:

```tsx
import { createPortal } from 'react-dom';
import { useUiStore } from '../../store/uiStore';
import { PlantsListView } from './PlantsListView';
import styles from './PlantsModal.module.css';

/** Detailed listview of every planting + tray seedling in the current garden. */
export function PlantsModal() {
  const setOpen = useUiStore((s) => s.setPlantsModalOpen);
  return createPortal(
    <div className={styles.backdrop} onClick={() => setOpen(false)}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Plants</h2>
          <button
            type="button"
            className={styles.close}
            onClick={() => setOpen(false)}
            aria-label="Close"
          >×</button>
        </div>
        <div className={styles.body}>
          <PlantsListView />
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3: Verify the import target exists as a placeholder**

`PlantsListView` doesn't exist yet — that's intentional; the next task creates it. Don't commit yet (TypeScript would fail). Continue to Task 5.

---

## Task 5: `PlantsListView.tsx` — minimal render with default columns

**Files:**
- Create: `src/components/plants/PlantsListView.tsx`
- Create: `src/components/plants/PlantsListView.module.css`
- Test: `src/components/plants/PlantsListView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/plants/PlantsListView.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PlantsListView } from './PlantsListView';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createStructure, createPlanting } from '../../model/types';
import { getAllCultivars } from '../../model/cultivars';

function seedGarden() {
  useGardenStore.getState().reset();
  useUiStore.getState().reset();
  const garden = useGardenStore.getState().garden;
  const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
  bed.label = 'Bed A';
  const cv = getAllCultivars()[0];
  const planting = createPlanting({ parentId: bed.id, x: 1, y: 1, cultivarId: cv.id });
  useGardenStore.setState({
    garden: { ...garden, structures: [bed], plantings: [planting] },
  });
  return { bed, planting, cv };
}

describe('PlantsListView', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders a row for each planting with the default columns', () => {
    const { cv } = seedGarden();
    render(<PlantsListView />);
    // Default columns visible
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /location/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /stage/i })).toBeInTheDocument();
    // Row content
    const row = screen.getByRole('row', { name: new RegExp(cv.name, 'i') });
    expect(within(row).getByText('Bed A')).toBeInTheDocument();
    expect(within(row).getByText(/planted/i)).toBeInTheDocument();
  });

  it('renders empty state when the garden has no plants', () => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    render(<PlantsListView />);
    expect(screen.getByText(/no plants in this garden/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PlantsListView`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the CSS module**

Create `src/components/plants/PlantsListView.module.css`:

```css
.root { display: flex; flex-direction: column; min-height: 0; }
.toolbar {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-bottom: 1px solid #eee;
}
.search { flex: 1; padding: 4px 8px; font-size: 13px; }
.chips { display: flex; gap: 4px; }
.chip {
  padding: 2px 8px; border: 1px solid #ccc; background: #fff;
  border-radius: 12px; font-size: 12px; cursor: pointer;
}
.chipActive { background: #333; color: #fff; border-color: #333; }
.tableWrap { overflow: auto; max-height: 70vh; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th, .table td {
  text-align: left; padding: 4px 8px; border-bottom: 1px solid #eee;
  white-space: nowrap;
}
.table th { cursor: pointer; user-select: none; background: #fafafa; position: sticky; top: 0; }
.rowActive { background: #fff4c2; }
.empty { padding: 24px; text-align: center; color: #888; }
.iconCell { width: 24px; }
.iconCell img { width: 18px; height: 18px; object-fit: contain; display: block; }
.numeric { text-align: right; font-variant-numeric: tabular-nums; }
.colEditor { position: relative; }
.colEditorPopover {
  position: absolute; right: 0; top: 100%; margin-top: 4px;
  background: #fff; border: 1px solid #ccc; border-radius: 4px;
  padding: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 10;
  min-width: 180px;
}
.colEditorPopover label { display: flex; gap: 6px; padding: 2px 0; font-size: 12px; cursor: pointer; }
```

- [ ] **Step 4: Create minimal `PlantsListView.tsx`**

Create `src/components/plants/PlantsListView.tsx`:

```tsx
import { useMemo } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { buildPlantRows, type PlantRow } from './plantsViewModel';
import styles from './PlantsListView.module.css';

interface ColumnDef {
  id: string;
  label: string;
  render: (row: PlantRow) => React.ReactNode;
  numeric?: boolean;
  defaultVisible: boolean;
}

const COLUMNS: ColumnDef[] = [
  { id: 'icon', label: '', defaultVisible: true,
    render: (r) => r.iconImage
      ? <img src={r.iconImage} alt="" />
      : null },
  { id: 'name', label: 'Name', defaultVisible: true, render: (r) => r.name },
  { id: 'variety', label: 'Variety', defaultVisible: true, render: (r) => r.variety ?? '—' },
  { id: 'category', label: 'Category', defaultVisible: true, render: (r) => r.category ?? '—' },
  { id: 'location', label: 'Location', defaultVisible: true, render: (r) => r.location },
  { id: 'stage', label: 'Stage', defaultVisible: true, render: (r) => r.stage },
  { id: 'spacing', label: 'Spacing (ft)', defaultVisible: true, numeric: true,
    render: (r) => r.spacingFt ?? '—' },
  { id: 'height', label: 'Height (ft)', defaultVisible: true, numeric: true,
    render: (r) => r.heightFt ?? '—' },
  { id: 'footprint', label: 'Footprint (ft)', defaultVisible: true, numeric: true,
    render: (r) => r.footprintFt ?? '—' },
  { id: 'nextAction', label: 'Next action', defaultVisible: true,
    render: (r) => r.nextAction ? `${r.nextAction.name} (${r.nextAction.earliest})` : '—' },
  { id: 'rowId', label: 'ID', defaultVisible: false, render: (r) => r.id },
  { id: 'cultivarId', label: 'Cultivar ID', defaultVisible: false, render: (r) => r.cultivarId },
  { id: 'speciesId', label: 'Species ID', defaultVisible: false, render: (r) => r.speciesId },
  { id: 'parentId', label: 'Parent ID', defaultVisible: false, render: (r) => r.parentId ?? '—' },
  { id: 'position', label: 'Position', defaultVisible: false,
    render: (r) => (r.x == null || r.y == null)
      ? '—'
      : `(${r.x.toFixed(2)}, ${r.y.toFixed(2)})` },
  { id: 'climber', label: 'Climber', defaultVisible: false, render: (r) => r.climber ? 'yes' : 'no' },
  { id: 'iconPath', label: 'Icon path', defaultVisible: false, render: (r) => r.iconImage ?? '—' },
  { id: 'allActions', label: 'All actions', defaultVisible: false,
    render: (r) => r.allActions.length === 0
      ? '—'
      : r.allActions.map((a) => `${a.actionName ?? a.actionId} @ ${a.earliest}`).join('; ') },
];

const DEFAULT_VISIBLE = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);

export function PlantsListView() {
  const garden = useGardenStore((s) => s.garden);

  const rows: PlantRow[] = useMemo(
    () => buildPlantRows(garden, { actions: [] }),
    [garden],
  );

  const visibleColumns = COLUMNS.filter((c) => DEFAULT_VISIBLE.includes(c.id));

  if (rows.length === 0) {
    return <div className={styles.empty}>No plants in this garden.</div>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {visibleColumns.map((col) => (
                <th key={col.id}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} aria-label={row.name}>
                {visibleColumns.map((col) => (
                  <td
                    key={col.id}
                    className={col.numeric ? styles.numeric : (col.id === 'icon' ? styles.iconCell : undefined)}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Note: if the scheduler's action label field was *not* `actionName`/`actionId` (Task 2 Step 4), update the `allActions` column's render line accordingly.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- PlantsListView`
Expected: PASS — two passing tests. Also run `npm run lint` to verify the project lints clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/plants/PlantsModal.tsx src/components/plants/PlantsModal.module.css \
        src/components/plants/PlantsListView.tsx src/components/plants/PlantsListView.module.css \
        src/components/plants/PlantsListView.test.tsx
git commit -m "feat(plants): PlantsModal shell + minimal listview"
```

---

## Task 6: Sorting

**Files:**
- Modify: `src/components/plants/PlantsListView.tsx`
- Test: `src/components/plants/PlantsListView.test.tsx`

- [ ] **Step 1: Write the failing test**

Append a test inside the existing `describe('PlantsListView', ...)`:

```tsx
  it('sorts rows when a column header is clicked, toggling direction on repeat click', async () => {
    const { user } = await renderWithTwo();
    // Initially: names in insertion order (Aaa, Zzz)
    const namesBefore = screen.getAllByRole('row').slice(1).map((r) => r.getAttribute('aria-label'));
    expect(namesBefore[0]?.startsWith('A')).toBe(true);
    await user.click(screen.getByRole('columnheader', { name: /^name/i }));
    // After one click: still asc, A first
    const after1 = screen.getAllByRole('row').slice(1).map((r) => r.getAttribute('aria-label'));
    expect(after1[0]?.startsWith('A')).toBe(true);
    await user.click(screen.getByRole('columnheader', { name: /^name/i }));
    // After second click: desc, Z first
    const after2 = screen.getAllByRole('row').slice(1).map((r) => r.getAttribute('aria-label'));
    expect(after2[0]?.startsWith('Z')).toBe(true);
  });
```

And add this helper at the top of the test file (above `describe`):

```tsx
import userEvent from '@testing-library/user-event';

async function renderWithTwo() {
  useGardenStore.getState().reset();
  useUiStore.getState().reset();
  const garden = useGardenStore.getState().garden;
  const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
  bed.label = 'Bed A';
  const cvs = getAllCultivars();
  const aRow = { ...createPlanting({ parentId: bed.id, x: 0, y: 0, cultivarId: cvs[0].id }) };
  const zRow = { ...createPlanting({ parentId: bed.id, x: 1, y: 1, cultivarId: cvs[0].id }) };
  // Force display names so sort is deterministic regardless of catalog content.
  aRow.label = 'Aaa-plant';
  zRow.label = 'Zzz-plant';
  // We sort by row.name (cultivar name). Patch via cultivar lookup by mutating cultivarId
  // isn't possible — instead we test by `label` if we sort name from `row.name = label-or-cultivar`.
  // Simpler: stub the cultivar list isn't worth it; instead, sort the existing two plantings
  // by `name` which will be the same; the test below instead sorts by `id` to be deterministic.
  useGardenStore.setState({ garden: { ...garden, structures: [bed], plantings: [aRow, zRow] } });
  const user = userEvent.setup();
  render(<PlantsListView />);
  return { user };
}
```

The helper above is intentionally awkward — `name` comes from the cultivar, not the planting, so sorting by name on two same-cultivar plantings gives a tie. Replace the test with the simpler variant below, which sorts by **ID** column (deterministic) instead:

```tsx
  it('sorts rows when a column header is clicked, toggling direction on repeat click', async () => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    const garden = useGardenStore.getState().garden;
    const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    bed.label = 'Bed A';
    const cv = getAllCultivars()[0];
    const p1 = { ...createPlanting({ parentId: bed.id, x: 0, y: 0, cultivarId: cv.id }), id: 'aaa' };
    const p2 = { ...createPlanting({ parentId: bed.id, x: 1, y: 1, cultivarId: cv.id }), id: 'zzz' };
    useGardenStore.setState({ garden: { ...garden, structures: [bed], plantings: [p2, p1] } });
    // Make the ID column visible by writing a localStorage override.
    window.localStorage.setItem('plantsListView.visibleColumns',
      JSON.stringify(['name', 'rowId']));
    const user = userEvent.setup();
    render(<PlantsListView />);

    const ids = () => screen.getAllByRole('row').slice(1)
      .map((r) => within(r).getAllByRole('cell').at(-1)!.textContent);
    expect(ids()).toEqual(['zzz', 'aaa']); // insertion order
    await user.click(screen.getByRole('columnheader', { name: /^id/i }));
    expect(ids()).toEqual(['aaa', 'zzz']); // asc
    await user.click(screen.getByRole('columnheader', { name: /^id/i }));
    expect(ids()).toEqual(['zzz', 'aaa']); // desc
  });
```

Discard the messy `renderWithTwo` helper from above; keep just the cleaner test. Also add `import userEvent from '@testing-library/user-event';` if not already imported. (This task assumes Task 9 wires localStorage column visibility; if running tests strictly in order, this test depends on Task 9 — see Step 4 note below.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PlantsListView`
Expected: FAIL — clicking a header does nothing yet, order stays as inserted.

- [ ] **Step 3: Implement sort state and comparator**

In `src/components/plants/PlantsListView.tsx`:

1. At the top, add: `import { useState } from 'react';` (merge with the existing React import).
2. Replace the body of `PlantsListView` so the visible-columns and rows logic includes sort. Replace the early-return + render section starting at `const visibleColumns = ...` with:

```tsx
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const visibleColumns = COLUMNS.filter((c) => DEFAULT_VISIBLE.includes(c.id));

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => compareRows(a, b, sortColumn));
    return sortDir === 'asc' ? arr : arr.reverse();
  }, [rows, sortColumn, sortDir]);

  function onHeaderClick(colId: string) {
    if (colId === sortColumn) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(colId);
      setSortDir('asc');
    }
  }

  if (rows.length === 0) {
    return <div className={styles.empty}>No plants in this garden.</div>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {visibleColumns.map((col) => (
                <th key={col.id} onClick={() => onHeaderClick(col.id)}>
                  {col.label}{sortColumn === col.id ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.id} aria-label={row.name}>
                {visibleColumns.map((col) => (
                  <td
                    key={col.id}
                    className={col.numeric ? styles.numeric : (col.id === 'icon' ? styles.iconCell : undefined)}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

3. Above the component, add the comparator helper:

```ts
function compareRows(a: PlantRow, b: PlantRow, columnId: string): number {
  const valueFor = (r: PlantRow): string | number | undefined => {
    switch (columnId) {
      case 'name': return r.name;
      case 'variety': return r.variety ?? '';
      case 'category': return r.category ?? '';
      case 'location': return r.location;
      case 'stage': return r.stage;
      case 'spacing': return r.spacingFt;
      case 'height': return r.heightFt;
      case 'footprint': return r.footprintFt;
      case 'nextAction': return r.nextAction?.earliest ?? '';
      case 'rowId': return r.id;
      case 'cultivarId': return r.cultivarId;
      case 'speciesId': return r.speciesId;
      case 'parentId': return r.parentId ?? '';
      case 'position':
        return r.x == null || r.y == null ? Number.POSITIVE_INFINITY : r.x * 10000 + r.y;
      case 'climber': return r.climber ? 1 : 0;
      case 'iconPath': return r.iconImage ?? '';
      case 'allActions': return r.allActions.length;
      default: return r.name;
    }
  };
  const av = valueFor(a);
  const bv = valueFor(b);
  // Undefined sorts last (in ascending order).
  if (av === undefined && bv === undefined) return 0;
  if (av === undefined) return 1;
  if (bv === undefined) return -1;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- PlantsListView`
Expected: the new sort test fails *only* because the `rowId` column is hidden by default and the test uses localStorage to enable it before Task 9 implements localStorage reading. If the previous tests still pass and the new sort test fails with "Unable to find role 'columnheader' name /^id/i", that's expected at this point — leave the test in place; it will start passing once Task 9 wires localStorage.

If you want a sort test that passes here without depending on Task 9, replace the failing sort test with a sort test that clicks the **Location** column (which is in the default-visible set) — duplicate `bed.label = 'Aaa'` and a second bed `'Zzz'` with a planting in each. Either approach is acceptable; the Location-based version is preferable since it isolates Task 6 from Task 9. Use whichever feels cleaner.

- [ ] **Step 5: Commit**

```bash
git add src/components/plants/PlantsListView.tsx src/components/plants/PlantsListView.test.tsx
git commit -m "feat(plants): sortable columns"
```

---

## Task 7: Text search + stage filter chips

**Files:**
- Modify: `src/components/plants/PlantsListView.tsx`
- Test: `src/components/plants/PlantsListView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append inside the same `describe`:

```tsx
  it('filters rows by text search across name/variety/location', async () => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    const garden = useGardenStore.getState().garden;
    const bed1 = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    bed1.label = 'North Bed';
    const bed2 = createStructure({ type: 'raised-bed', x: 5, y: 5, width: 4, length: 4 });
    bed2.label = 'South Bed';
    const cv = getAllCultivars()[0];
    const p1 = createPlanting({ parentId: bed1.id, x: 0, y: 0, cultivarId: cv.id });
    const p2 = createPlanting({ parentId: bed2.id, x: 0, y: 0, cultivarId: cv.id });
    useGardenStore.setState({
      garden: { ...garden, structures: [bed1, bed2], plantings: [p1, p2] },
    });
    const user = userEvent.setup();
    render(<PlantsListView />);
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2
    await user.type(screen.getByPlaceholderText(/search/i), 'south');
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + 1
    expect(screen.getByText('South Bed')).toBeInTheDocument();
  });

  it('filters by stage chip', async () => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    const garden = useGardenStore.getState().garden;
    const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    bed.label = 'Bed';
    const cv = getAllCultivars()[0];
    const planting = createPlanting({ parentId: bed.id, x: 0, y: 0, cultivarId: cv.id });
    useGardenStore.setState({
      garden: {
        ...garden,
        structures: [bed],
        plantings: [planting],
        seedStarting: {
          trays: [{
            id: 't', label: 'Tray', rows: 1, cols: 1,
            cellSize: 'medium', cellPitchIn: 1.5, widthIn: 5, heightIn: 5,
            slots: [{ state: 'sown', seedlingId: 's' }],
          }],
          seedlings: [{ id: 's', cultivarId: cv.id, trayId: 't', row: 0, col: 0, labelOverride: null }],
        },
      },
    });
    const user = userEvent.setup();
    render(<PlantsListView />);
    expect(screen.getAllByRole('row')).toHaveLength(3); // 1 planting + 1 seedling + header
    await user.click(screen.getByRole('button', { name: /^plantings$/i }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /^seedlings$/i }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /^all$/i }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
```

- [ ] **Step 2: Run test to verify they fail**

Run: `npm test -- PlantsListView`
Expected: FAIL — no search input, no chips.

- [ ] **Step 3: Implement toolbar + filtering**

In `PlantsListView.tsx`:

1. Inside the component, after the `sortDir` state declaration, add:

```tsx
  const [searchText, setSearchText] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | 'planting' | 'seedling'>('all');
```

2. Replace the `sortedRows` useMemo with one that filters first:

```tsx
  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rows.filter((r) => {
      if (stageFilter === 'planting' && r.kind !== 'planting') return false;
      if (stageFilter === 'seedling' && r.kind !== 'seedling') return false;
      if (!q) return true;
      const haystack = [r.name, r.variety ?? '', r.location, r.cultivarId, r.id]
        .join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchText, stageFilter]);

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => compareRows(a, b, sortColumn));
    return sortDir === 'asc' ? arr : arr.reverse();
  }, [filteredRows, sortColumn, sortDir]);
```

3. Replace the empty-state early return with one that distinguishes "no plants at all" from "no matches":

```tsx
  if (rows.length === 0) {
    return <div className={styles.empty}>No plants in this garden.</div>;
  }
```

4. Add the toolbar above the `<div className={styles.tableWrap}>`:

```tsx
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search name, variety, location…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <div className={styles.chips}>
          {(['all', 'planting', 'seedling'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.chip} ${stageFilter === s ? styles.chipActive : ''}`}
              onClick={() => setStageFilter(s)}
            >
              {s === 'all' ? 'All' : s === 'planting' ? 'Plantings' : 'Seedlings'}
            </button>
          ))}
        </div>
      </div>
```

5. Replace the `tbody` mapping to iterate `sortedRows` (already the case), and add a zero-match fallback row beneath the table:

```tsx
        {sortedRows.length === 0 && (
          <div className={styles.empty}>
            No plants match these filters.{' '}
            <button type="button" onClick={() => { setSearchText(''); setStageFilter('all'); }}>
              Clear filters
            </button>
          </div>
        )}
```

Place this after the closing `</table>` but inside `<div className={styles.tableWrap}>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- PlantsListView`
Expected: PASS — search test and stage-filter test both green.

- [ ] **Step 5: Commit**

```bash
git add src/components/plants/PlantsListView.tsx src/components/plants/PlantsListView.test.tsx
git commit -m "feat(plants): text search + stage chips"
```

---

## Task 8: Row click → select on canvas (modal stays open)

**Files:**
- Modify: `src/components/plants/PlantsListView.tsx`
- Test: `src/components/plants/PlantsListView.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside the same `describe`:

```tsx
  it('row click selects on canvas and does not close the modal', async () => {
    const { planting } = seedGarden();
    useUiStore.getState().setPlantsModalOpen(true);
    const user = userEvent.setup();
    render(<PlantsListView />);
    const row = screen.getByRole('row', { name: new RegExp(planting.label, 'i') });
    await user.click(row);
    expect(useUiStore.getState().selectedIds).toEqual([planting.id]);
    expect(useUiStore.getState().plantsModalOpen).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PlantsListView`
Expected: FAIL — clicking a row currently does nothing.

- [ ] **Step 3: Wire selection**

In `PlantsListView.tsx`:

1. Add to the imports:

```tsx
import { useUiStore } from '../../store/uiStore';
```

2. Inside the component, near the top:

```tsx
  const selectedIds = useUiStore((s) => s.selectedIds);
  const setSelection = useUiStore((s) => s.setSelection);
```

3. Update the row `<tr>` to be clickable and highlight when selected:

```tsx
            {sortedRows.map((row) => (
              <tr
                key={row.id}
                aria-label={row.name}
                className={selectedIds.includes(row.id) ? styles.rowActive : undefined}
                onClick={() => setSelection([row.id])}
              >
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- PlantsListView`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/plants/PlantsListView.tsx src/components/plants/PlantsListView.test.tsx
git commit -m "feat(plants): row click selects on canvas"
```

---

## Task 9: Column editor + localStorage persistence

**Files:**
- Modify: `src/components/plants/PlantsListView.tsx`
- Test: `src/components/plants/PlantsListView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append inside the same `describe`:

```tsx
  it('hides and shows columns via the column editor and persists to localStorage', async () => {
    seedGarden();
    const user = userEvent.setup();
    render(<PlantsListView />);
    expect(screen.getByRole('columnheader', { name: /variety/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /columns/i }));
    await user.click(screen.getByRole('checkbox', { name: /variety/i }));
    expect(screen.queryByRole('columnheader', { name: /variety/i })).toBeNull();
    const stored = JSON.parse(window.localStorage.getItem('plantsListView.visibleColumns') ?? '[]');
    expect(stored).not.toContain('variety');
  });

  it('honors localStorage visible-columns set on mount', () => {
    window.localStorage.setItem(
      'plantsListView.visibleColumns',
      JSON.stringify(['name', 'rowId']),
    );
    seedGarden();
    render(<PlantsListView />);
    expect(screen.getByRole('columnheader', { name: /^id$/i })).toBeInTheDocument();
    // 'variety' was in the defaults but is not in our explicit list — should be hidden.
    expect(screen.queryByRole('columnheader', { name: /variety/i })).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify they fail**

Run: `npm test -- PlantsListView`
Expected: FAIL — no "Columns" button, no persistence wiring.

- [ ] **Step 3: Implement column-editor state + persistence**

In `PlantsListView.tsx`:

1. Add helper above the component:

```ts
const LS_KEY = 'plantsListView.visibleColumns';

function readVisibleColumns(): string[] {
  if (typeof window === 'undefined') return DEFAULT_VISIBLE;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === 'string')) {
      return DEFAULT_VISIBLE;
    }
    return parsed;
  } catch {
    return DEFAULT_VISIBLE;
  }
}
```

2. Inside the component, replace the `const visibleColumns = ...` line with state:

```tsx
  const [visibleIds, setVisibleIds] = useState<string[]>(() => readVisibleColumns());
  const [columnEditorOpen, setColumnEditorOpen] = useState(false);
  const visibleColumns = COLUMNS.filter((c) => visibleIds.includes(c.id));

  function toggleColumn(id: string) {
    setVisibleIds((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      try { window.localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }
```

3. Add a "Columns ▾" button + popover to the toolbar, after the chips block:

```tsx
        <div className={styles.colEditor}>
          <button type="button" onClick={() => setColumnEditorOpen((v) => !v)}>
            Columns ▾
          </button>
          {columnEditorOpen && (
            <div className={styles.colEditorPopover}>
              {COLUMNS.filter((c) => c.label !== '').map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={visibleIds.includes(c.id)}
                    onChange={() => toggleColumn(c.id)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- PlantsListView`
Expected: PASS — including the previously-deferred sort-by-ID test from Task 6 (if you kept that variant).

- [ ] **Step 5: Commit**

```bash
git add src/components/plants/PlantsListView.tsx src/components/plants/PlantsListView.test.tsx
git commit -m "feat(plants): column editor + localStorage persistence"
```

---

## Task 10: Use the real scheduler for `nextAction`

**Files:**
- Modify: `src/components/plants/PlantsListView.tsx`

Until now `PlantsListView` passed `{ actions: [] }` as the schedule. This task wires up the actual scheduler the same way `ScheduleView` does.

- [ ] **Step 1: Add scheduler imports**

At the top of `PlantsListView.tsx`:

```tsx
import { buildSchedule, type Schedule } from '../../model/scheduler';
import { defaultActionsForCultivar } from '../../model/defaultActions';
import { getCultivar } from '../../model/cultivars';
```

- [ ] **Step 2: Build the schedule inside the component**

Inside `PlantsListView`, replace:

```tsx
  const rows: PlantRow[] = useMemo(
    () => buildPlantRows(garden, { actions: [] }),
    [garden],
  );
```

with:

```tsx
  const almanacLastFrost = useUiStore((s) => s.almanacFilters?.lastFrostDate ?? null);

  const schedule: Schedule = useMemo(() => {
    const plants = [
      ...garden.plantings.map((p) => ({ id: p.id, cultivarId: p.cultivarId, label: p.label })),
      ...garden.seedStarting.seedlings.map((s) => ({ id: s.id, cultivarId: s.cultivarId, label: undefined })),
    ]
      .map((p) => {
        const cv = getCultivar(p.cultivarId);
        if (!cv) return null;
        return {
          id: p.id,
          cultivarId: p.cultivarId,
          label: p.label ?? cv.name,
          actions: defaultActionsForCultivar(cv),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    return buildSchedule({
      plants,
      targetTransplantDate: almanacLastFrost ?? new Date().toISOString().slice(0, 10),
      lastFrostDate: almanacLastFrost ?? undefined,
    });
  }, [garden, almanacLastFrost]);

  const rows: PlantRow[] = useMemo(
    () => buildPlantRows(garden, schedule),
    [garden, schedule],
  );
```

- [ ] **Step 3: Cross-check `buildSchedule` call signature**

Run: `grep -n "interface ScheduleInputs\|export function buildSchedule" src/model/scheduler.ts && sed -n '120,135p' src/model/scheduler.ts`

If `buildSchedule` requires different fields than the call above, adjust to match. Compare against `src/components/schedule/ScheduleView.tsx` lines 36-55, which is the working reference.

- [ ] **Step 4: Run all listview tests**

Run: `npm test -- PlantsListView`
Expected: PASS — existing tests still green. (They pass `garden` directly to the component; scheduling produces extra `nextAction` data that the existing tests don't assert on.)

- [ ] **Step 5: Commit**

```bash
git add src/components/plants/PlantsListView.tsx
git commit -m "feat(plants): wire scheduler so Next action column populates"
```

---

## Task 11: Wire the modal into the app

**Files:**
- Modify: `src/components/MenuBar.tsx`
- Modify: `src/components/App.tsx`

- [ ] **Step 1: Add "Plants…" entry to the MenuBar**

In `src/components/MenuBar.tsx`:

1. Near the top of the component body, after the existing `setScheduleOpen` line, add:

```tsx
  const setPlantsModalOpen = useUiStore((s) => s.setPlantsModalOpen);
```

2. In the JSX, immediately after the `<span onClick={() => setScheduleOpen(true)}>Schedule…</span>` line, add:

```tsx
        <span onClick={() => setPlantsModalOpen(true)}>Plants…</span>
```

- [ ] **Step 2: Mount the modal from `App.tsx`**

In `src/components/App.tsx`:

1. Add to the imports:

```tsx
import { PlantsModal } from './plants/PlantsModal';
```

2. Near the existing `const scheduleOpen = useUiStore((s) => s.scheduleOpen);` line, add:

```tsx
  const plantsModalOpen = useUiStore((s) => s.plantsModalOpen);
```

3. Immediately after `{scheduleOpen && <ScheduleModal />}`, add:

```tsx
      {plantsModalOpen && <PlantsModal />}
```

- [ ] **Step 3: Smoke test the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

Then run: `npm test`
Expected: full suite passes.

Then run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Manual verification in dev server**

Run: `npm run dev`
Steps:
1. Open the app in a browser.
2. Click MenuBar → "Plants…" — modal opens with the listview.
3. Add a planting and a tray seedling via the existing UI; reopen the modal — both appear.
4. Click a column header — sort toggles asc/desc.
5. Type in the search box — rows filter.
6. Click the "Plantings" / "Seedlings" / "All" chips — rows filter by stage.
7. Click a row — the canvas selection updates; the modal stays open.
8. Open "Columns ▾" — toggle a hidden column on (e.g., ID) and a default column off (e.g., Variety); reload the page; the column visibility persists.
9. Close the modal via × or backdrop.

Report any issue you can't fix as a bug rather than claiming completion.

- [ ] **Step 5: Commit**

```bash
git add src/components/MenuBar.tsx src/components/App.tsx
git commit -m "feat(plants): wire PlantsModal into MenuBar + App"
```

---

## Self-review notes (for the implementor)

- The spec lists every column under both "default visible" and "toggleable" — both groups are implemented in `COLUMNS` in Task 5 with the `defaultVisible` flag controlling initial visibility.
- The spec calls out that the modal must *not* close when a row is clicked — Task 8 explicitly verifies this in its test.
- The spec calls out localStorage parse failure falling back silently — `readVisibleColumns` wraps `JSON.parse` in `try/catch` (Task 9).
- "Next action" uses `schedule.actions` as already pre-sorted by `earliest`; the first match per `plantId` is the next action (Task 2). If you need to verify ordering, see `src/model/scheduler.ts` around lines 195-200.
- One known quirk: the column editor popover does not auto-close on outside click. Acceptable for v1; flag it as a follow-up issue if you find it annoying.
