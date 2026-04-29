# Seed Starting Mode v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Seed Starting mode to the Garden Planner — a second canvas for designing one tray of seedlings at a time, in inches, alongside the existing garden canvas.

**Architecture:** A top-bar mode toggle swaps the canvas between Garden and Seed Starting. Both modes share the same `Garden` save document, with seed-starting state in a `seedStarting` namespace. Trays are the new top-level object; each tray has a fixed grid of cells, each cell can hold a Seedling (persistent identity, sown/empty/transplanted state). The renderer is shared with mode-gated layers — garden layers off in seed mode, tray/cell layers off in garden mode. The flora database gets an optional `seedStarting` sub-object for per-species seed-starting metadata.

**Tech Stack:** React 19, TypeScript, Zustand, Vite, Vitest, Biome. Existing canvas rendering pipeline (`CanvasStack`, layer renderers in `src/canvas/layers/`).

**v1 Scope (decided in brainstorm):**
- Top-bar mode switcher (Garden / Seed Starting)
- Top-bar tray dropdown — switch trays, create new
- Single-tray-focus canvas, inch-scale (per-mode unit system)
- Tray catalog + custom builder
- Sidebar with trays styled like garden palette + filtered seedable species list
- Drag species onto cell (primary) + optional fill-tray drag (stretch)
- Cell states: empty / sown / transplanted (transplanted reachable via data, not UI)
- Icon + optional label per cell
- Flora `seedStarting.*` fields, only `startable` + `cellSize` populated for now
- Combined save with `seedStarting` namespace
- Shared renderer with mode-gated layers
- Persistent seedling identity (data only — transplant UI is deferred)

**Out of scope (deferred):**
- Transplant flow / cross-mode linkage UI
- Sow date / timeline metadata
- Multiple trays on one canvas
- Germination / failed cell states
- Cross-mode plant ↔ seedling linkage UI

---

## File Structure

**New files:**
- `src/model/seedStarting.ts` — `Tray`, `TraySlot`, `Seedling`, `SeedStartingState` types + factories
- `src/model/seedStarting.test.ts` — type/factory tests
- `src/model/trayCatalog.ts` — built-in tray presets (1020 36-cell, 72-cell, etc.) + lookup
- `src/model/trayCatalog.test.ts`
- `src/model/floraSeedStarting.ts` — `SeedStartingFields` interface + accessor that reads optional fields from species/cultivar
- `src/store/seedStartingActions.ts` — store actions for trays/seedlings (composed into gardenStore)
- `src/store/seedStartingActions.test.ts`
- `src/canvas/layers/trayLayers.ts` — render trays + cell grid
- `src/canvas/layers/trayLayers.test.ts`
- `src/canvas/layers/seedlingLayers.ts` — render seedlings within cells
- `src/canvas/layers/seedlingLayers.test.ts`
- `src/canvas/seedStartingHitTest.ts` — cell-level hit testing
- `src/canvas/seedStartingHitTest.test.ts`
- `src/components/ModeSwitcher.tsx` — top-bar segmented control
- `src/components/TraySwitcher.tsx` — top-bar tray dropdown
- `src/components/CustomTrayBuilder.tsx` — modal for custom tray creation
- `src/components/palette/SeedStartingPalette.tsx` — sidebar palette in seed mode
- `src/styles/ModeSwitcher.module.css`
- `src/styles/TraySwitcher.module.css`
- `src/styles/CustomTrayBuilder.module.css`

**Modified files:**
- `src/model/types.ts` — add `seedStarting: SeedStartingState` field to `Garden`; loadGarden backfill
- `src/model/species.ts` — add optional `seedStarting?: SeedStartingFields`
- `src/model/cultivars.ts` — add optional `seedStarting?: Partial<SeedStartingFields>`; resolve from species
- `src/store/gardenStore.ts` — wire in seed-starting actions; backfill on load
- `src/store/uiStore.ts` — add `appMode: 'garden' | 'seed-starting'`, `currentTrayId: string | null`, setters; add `seedStartingZoom`/`seedStartingPanX`/`seedStartingPanY` (per-mode view state)
- `src/components/App.tsx` — render either garden or seed-starting canvas/palette based on `appMode`; route palette drag handler accordingly
- `src/components/MenuBar.tsx` — add `<ModeSwitcher />` and `<TraySwitcher />` (latter only in seed mode)
- `src/canvas/CanvasStack.tsx` — gate render layers on `appMode`; switch to inch-scale when in seed mode
- `src/canvas/hitTest.ts` — delegate to `seedStartingHitTest` in seed mode
- `src/components/sidebar/RenderLayersPanel.tsx` — add seed-starting layers (tray, cells, seedlings) when in seed mode

---

## Phase 1 — Data Model Foundation

### Task 1: Define SeedStarting types

**Files:**
- Create: `src/model/seedStarting.ts`
- Test: `src/model/seedStarting.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/model/seedStarting.test.ts
import { describe, expect, it } from 'vitest';
import {
  createTray,
  createSeedling,
  emptySeedStartingState,
  getCell,
  setCell,
} from './seedStarting';

describe('seedStarting types', () => {
  it('createTray builds a tray with rows*cols empty slots', () => {
    const tray = createTray({ rows: 6, cols: 6, cellSize: 'medium', label: '36-cell' });
    expect(tray.rows).toBe(6);
    expect(tray.cols).toBe(6);
    expect(tray.slots).toHaveLength(36);
    expect(tray.slots.every((s) => s.state === 'empty')).toBe(true);
  });

  it('cell address is row*cols + col', () => {
    const tray = createTray({ rows: 3, cols: 4, cellSize: 'medium', label: 't' });
    const slot = getCell(tray, 2, 1);
    expect(slot).toBeDefined();
    expect(tray.slots.indexOf(slot!)).toBe(2 * 4 + 1);
  });

  it('setCell replaces a slot in place', () => {
    const tray = createTray({ rows: 2, cols: 2, cellSize: 'small', label: 't' });
    const seedling = createSeedling({ cultivarId: 'basil-genovese' });
    const updated = setCell(tray, 0, 1, { state: 'sown', seedlingId: seedling.id });
    expect(getCell(updated, 0, 1)?.state).toBe('sown');
    expect(getCell(updated, 0, 0)?.state).toBe('empty');
  });

  it('emptySeedStartingState has empty trays and seedlings', () => {
    const s = emptySeedStartingState();
    expect(s.trays).toEqual([]);
    expect(s.seedlings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/model/seedStarting.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/model/seedStarting.ts
import { generateId } from './types';

export type CellSize = 'small' | 'medium' | 'large';
export type CellState = 'empty' | 'sown' | 'transplanted';

export interface TraySlot {
  state: CellState;
  /** Reference to the seedling occupying this slot (when state !== 'empty'). */
  seedlingId: string | null;
}

export interface Tray {
  id: string;
  label: string;
  rows: number;
  cols: number;
  /** Cell pitch in inches (the inner cell size). */
  cellSize: CellSize;
  /** Inches between cell centers (computed from cellSize but stored for custom trays). */
  cellPitchIn: number;
  /** Outer tray dimensions in inches. */
  widthIn: number;
  heightIn: number;
  /** Row-major: slots[row * cols + col]. */
  slots: TraySlot[];
}

export interface Seedling {
  id: string;
  cultivarId: string;
  /** Where this seedling currently lives. Null if transplanted-out (history only). */
  trayId: string | null;
  /** Cell address within `trayId` (null if not in a tray). */
  row: number | null;
  col: number | null;
  /** Optional user-set override for the cell label. */
  labelOverride: string | null;
}

export interface SeedStartingState {
  trays: Tray[];
  seedlings: Seedling[];
}

export const CELL_PITCH_IN: Record<CellSize, number> = {
  small: 1.1,   // 72-cell ~1.1in
  medium: 1.5,  // 36-cell ~1.5in
  large: 2.0,   // 18-cell ~2in
};

function emptySlot(): TraySlot {
  return { state: 'empty', seedlingId: null };
}

export function createTray(opts: {
  rows: number;
  cols: number;
  cellSize: CellSize;
  label: string;
  cellPitchIn?: number;
}): Tray {
  const pitch = opts.cellPitchIn ?? CELL_PITCH_IN[opts.cellSize];
  const slots = Array.from({ length: opts.rows * opts.cols }, emptySlot);
  return {
    id: generateId(),
    label: opts.label,
    rows: opts.rows,
    cols: opts.cols,
    cellSize: opts.cellSize,
    cellPitchIn: pitch,
    widthIn: opts.cols * pitch,
    heightIn: opts.rows * pitch,
    slots,
  };
}

export function createSeedling(opts: {
  cultivarId: string;
  trayId?: string | null;
  row?: number | null;
  col?: number | null;
}): Seedling {
  return {
    id: generateId(),
    cultivarId: opts.cultivarId,
    trayId: opts.trayId ?? null,
    row: opts.row ?? null,
    col: opts.col ?? null,
    labelOverride: null,
  };
}

export function emptySeedStartingState(): SeedStartingState {
  return { trays: [], seedlings: [] };
}

export function getCell(tray: Tray, row: number, col: number): TraySlot | undefined {
  if (row < 0 || row >= tray.rows || col < 0 || col >= tray.cols) return undefined;
  return tray.slots[row * tray.cols + col];
}

export function setCell(tray: Tray, row: number, col: number, slot: TraySlot): Tray {
  if (row < 0 || row >= tray.rows || col < 0 || col >= tray.cols) return tray;
  const idx = row * tray.cols + col;
  const slots = tray.slots.slice();
  slots[idx] = slot;
  return { ...tray, slots };
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/model/seedStarting.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/model/seedStarting.ts src/model/seedStarting.test.ts
git commit -m "feat(seed-starting): add Tray/Seedling/SeedStartingState types"
```

---

### Task 2: Wire SeedStartingState onto Garden

**Files:**
- Modify: `src/model/types.ts`
- Test: `src/model/types.test.ts` (existing)

- [ ] **Step 1: Add field to Garden interface**

In `src/model/types.ts`, import `SeedStartingState` and `emptySeedStartingState`, add to `Garden`:

```typescript
import type { SeedStartingState } from './seedStarting';
import { emptySeedStartingState } from './seedStarting';

export interface Garden {
  // ...existing fields...
  plantings: Planting[];
  seedStarting: SeedStartingState;
}
```

In `createGarden`:

```typescript
return {
  // ...existing fields...
  plantings: [],
  seedStarting: emptySeedStartingState(),
};
```

- [ ] **Step 2: Add a test for the field**

Append to `src/model/types.test.ts`:

```typescript
import { emptySeedStartingState } from './seedStarting';

describe('createGarden', () => {
  it('initializes seedStarting state', () => {
    const g = createGarden({ name: 't', widthFt: 1, heightFt: 1 });
    expect(g.seedStarting).toEqual(emptySeedStartingState());
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/model`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/model/types.ts src/model/types.test.ts
git commit -m "feat(seed-starting): add seedStarting namespace to Garden"
```

---

### Task 3: Backfill seedStarting on loadGarden

**Files:**
- Modify: `src/store/gardenStore.ts`
- Test: `src/store/gardenStore.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/store/gardenStore.test.ts`:

```typescript
import { emptySeedStartingState } from '../model/seedStarting';

it('loadGarden backfills seedStarting when missing', () => {
  const legacy = { ...blankGarden() } as any;
  delete legacy.seedStarting;
  useGardenStore.getState().loadGarden(legacy);
  expect(useGardenStore.getState().garden.seedStarting).toEqual(emptySeedStartingState());
});
```

- [ ] **Step 2: Update loadGarden in `src/store/gardenStore.ts`**

```typescript
import { emptySeedStartingState } from '../model/seedStarting';

loadGarden: (garden) => {
  clearHistory();
  for (const s of garden.structures) {
    if (s.wallThicknessFt == null) {
      s.wallThicknessFt = DEFAULT_WALL_THICKNESS_FT[s.type] ?? 0;
    }
    if (s.groupId === undefined) s.groupId = null;
  }
  if (!garden.seedStarting) garden.seedStarting = emptySeedStartingState();
  set({ garden });
},
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/store/gardenStore.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/store/gardenStore.ts src/store/gardenStore.test.ts
git commit -m "feat(seed-starting): backfill seedStarting on legacy loads"
```

---

### Task 4: Flora seed-starting fields

**Files:**
- Create: `src/model/floraSeedStarting.ts`
- Modify: `src/model/species.ts`
- Modify: `src/model/cultivars.ts`
- Test: `src/model/floraSeedStarting.test.ts`

- [ ] **Step 1: Define the shape**

Create `src/model/floraSeedStarting.ts`:

```typescript
import type { CellSize } from './seedStarting';

/** Per-species/cultivar seed-starting metadata. All fields optional in storage. */
export interface SeedStartingFields {
  /** Whether this species/cultivar makes sense to start indoors from seed. */
  startable: boolean;
  /** Recommended cell size for starting. */
  cellSize: CellSize;
  /** Min/max germination days — scaffolding for future timeline feature. */
  daysToGerminate: [number, number] | null;
  /** Min/max weeks from sow until ready to transplant. */
  weeksToTransplant: [number, number] | null;
  /** Sow depth in inches. */
  sowDepthIn: number | null;
  /** Light requirement during germination. */
  lightOnGermination: 'light' | 'dark' | 'either' | null;
  /** Needs heat mat. */
  bottomHeat: boolean | null;
  /** Freeform notes. */
  notes: string | null;
}

export const DEFAULT_SEED_STARTING_FIELDS: SeedStartingFields = {
  startable: false,
  cellSize: 'medium',
  daysToGerminate: null,
  weeksToTransplant: null,
  sowDepthIn: null,
  lightOnGermination: null,
  bottomHeat: null,
  notes: null,
};

/** Resolve effective seed-starting fields, merging cultivar over species defaults. */
export function resolveSeedStarting(
  speciesFields: Partial<SeedStartingFields> | undefined,
  cultivarFields: Partial<SeedStartingFields> | undefined,
): SeedStartingFields {
  return {
    ...DEFAULT_SEED_STARTING_FIELDS,
    ...(speciesFields ?? {}),
    ...(cultivarFields ?? {}),
  };
}
```

- [ ] **Step 2: Add optional field to Species**

In `src/model/species.ts`:

```typescript
import type { SeedStartingFields } from './floraSeedStarting';

export interface Species {
  // ...existing...
  iconBgColor: string | null;
  seedStarting?: Partial<SeedStartingFields>;
}
```

- [ ] **Step 3: Add to Cultivar (raw + resolved)**

In `src/model/cultivars.ts`:

```typescript
import { resolveSeedStarting, type SeedStartingFields } from './floraSeedStarting';

interface CultivarRaw {
  // ...existing...
  iconBgColor?: string;
  seedStarting?: Partial<SeedStartingFields>;
}

export interface Cultivar {
  // ...existing...
  iconBgColor: string | null;
  seedStarting: SeedStartingFields;
}

function resolveCultivar(raw: CultivarRaw): Cultivar {
  const species = getSpecies(raw.speciesId);
  if (!species) throw new Error(`Unknown species "${raw.speciesId}" for cultivar "${raw.id}"`);
  const name = raw.variety ? `${species.name}, ${raw.variety}` : species.name;
  return {
    id: raw.id,
    speciesId: raw.speciesId,
    name,
    category: species.category,
    taxonomicName: species.taxonomicName,
    variety: raw.variety,
    color: raw.color ?? species.color,
    footprintFt: raw.footprintFt ?? species.footprintFt,
    spacingFt: raw.spacingFt ?? species.spacingFt,
    iconImage: raw.iconImage ?? species.iconImage,
    iconBgColor: raw.iconBgColor ?? species.iconBgColor,
    seedStarting: resolveSeedStarting(species.seedStarting, raw.seedStarting),
  };
}
```

- [ ] **Step 4: Write tests**

Create `src/model/floraSeedStarting.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED_STARTING_FIELDS,
  resolveSeedStarting,
} from './floraSeedStarting';

describe('resolveSeedStarting', () => {
  it('returns defaults when neither side has fields', () => {
    expect(resolveSeedStarting(undefined, undefined)).toEqual(DEFAULT_SEED_STARTING_FIELDS);
  });

  it('species overrides defaults', () => {
    const r = resolveSeedStarting({ startable: true }, undefined);
    expect(r.startable).toBe(true);
    expect(r.cellSize).toBe('medium');
  });

  it('cultivar overrides species', () => {
    const r = resolveSeedStarting(
      { startable: true, cellSize: 'small' },
      { cellSize: 'large' },
    );
    expect(r.startable).toBe(true);
    expect(r.cellSize).toBe('large');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/model`
Expected: PASS, including existing cultivar tests.

- [ ] **Step 6: Commit**

```bash
git add src/model/floraSeedStarting.ts src/model/floraSeedStarting.test.ts src/model/species.ts src/model/cultivars.ts
git commit -m "feat(seed-starting): add seedStarting metadata to flora"
```

---

## Phase 2 — Mode Infrastructure

### Task 5: AppMode in uiStore

**Files:**
- Modify: `src/store/uiStore.ts`
- Test: `src/store/uiStore.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/store/uiStore.test.ts`:

```typescript
it('appMode defaults to garden and can switch', () => {
  useUiStore.getState().reset();
  expect(useUiStore.getState().appMode).toBe('garden');
  useUiStore.getState().setAppMode('seed-starting');
  expect(useUiStore.getState().appMode).toBe('seed-starting');
});

it('currentTrayId starts null and can be set', () => {
  useUiStore.getState().reset();
  expect(useUiStore.getState().currentTrayId).toBeNull();
  useUiStore.getState().setCurrentTrayId('tray-1');
  expect(useUiStore.getState().currentTrayId).toBe('tray-1');
});
```

- [ ] **Step 2: Implementation**

In `src/store/uiStore.ts`:

```typescript
export type AppMode = 'garden' | 'seed-starting';

interface UiStore {
  // ...existing...
  appMode: AppMode;
  currentTrayId: string | null;
  /** Per-mode view state for the seed-starting canvas (inches). */
  seedStartingZoom: number;
  seedStartingPanX: number;
  seedStartingPanY: number;
  setAppMode: (mode: AppMode) => void;
  setCurrentTrayId: (id: string | null) => void;
  setSeedStartingZoom: (zoom: number) => void;
  setSeedStartingPan: (x: number, y: number) => void;
}

// In defaultState():
appMode: 'garden' as AppMode,
currentTrayId: null as string | null,
seedStartingZoom: 30,   // ~30 px per inch starting zoom
seedStartingPanX: 0,
seedStartingPanY: 0,

// In useUiStore actions:
setAppMode: (mode) => set({ appMode: mode }),
setCurrentTrayId: (id) => set({ currentTrayId: id }),
setSeedStartingZoom: (z) => set({ seedStartingZoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) }),
setSeedStartingPan: (x, y) => set({ seedStartingPanX: x, seedStartingPanY: y }),
```

(Note: `MIN_ZOOM`/`MAX_ZOOM` may need expanded bounds for inch-scale; if 10–200 px/inch is too restrictive for seed mode, define separate `SEED_MIN_ZOOM = 5`, `SEED_MAX_ZOOM = 100` and clamp with those.)

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/store/uiStore.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/store/uiStore.ts src/store/uiStore.test.ts
git commit -m "feat(seed-starting): add appMode and currentTrayId to uiStore"
```

---

### Task 6: ModeSwitcher component

**Files:**
- Create: `src/components/ModeSwitcher.tsx`
- Create: `src/styles/ModeSwitcher.module.css`
- Modify: `src/components/MenuBar.tsx`

- [ ] **Step 1: Write component**

`src/components/ModeSwitcher.tsx`:

```typescript
import { useUiStore } from '../store/uiStore';
import styles from '../styles/ModeSwitcher.module.css';
import { useActiveTheme } from '../hooks/useActiveTheme';

export function ModeSwitcher() {
  const appMode = useUiStore((s) => s.appMode);
  const setAppMode = useUiStore((s) => s.setAppMode);
  const { theme } = useActiveTheme();

  return (
    <div className={styles.switcher} role="tablist" aria-label="App mode">
      <button
        role="tab"
        aria-selected={appMode === 'garden'}
        className={`${styles.tab} ${appMode === 'garden' ? styles.active : ''}`}
        style={{ background: appMode === 'garden' ? theme.listHover : 'transparent' }}
        onClick={() => setAppMode('garden')}
      >
        Garden
      </button>
      <button
        role="tab"
        aria-selected={appMode === 'seed-starting'}
        className={`${styles.tab} ${appMode === 'seed-starting' ? styles.active : ''}`}
        style={{ background: appMode === 'seed-starting' ? theme.listHover : 'transparent' }}
        onClick={() => setAppMode('seed-starting')}
      >
        Seed Starting
      </button>
    </div>
  );
}
```

`src/styles/ModeSwitcher.module.css`:

```css
.switcher {
  display: inline-flex;
  border-radius: 6px;
  overflow: hidden;
  margin: 0 12px;
}
.tab {
  padding: 4px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: background 120ms ease;
}
.tab:hover { opacity: 0.85; }
.active { font-weight: 600; }
```

- [ ] **Step 2: Insert into MenuBar**

In `src/components/MenuBar.tsx`, add `<ModeSwitcher />` between the title and devNav blocks:

```typescript
import { ModeSwitcher } from './ModeSwitcher';

// ...inside return, after <div className={styles.title}>...:
<ModeSwitcher />
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`. Open the browser, confirm the switcher renders, both tabs are clickable, and the active tab highlight tracks.

- [ ] **Step 4: Type-check + lint**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/ModeSwitcher.tsx src/styles/ModeSwitcher.module.css src/components/MenuBar.tsx
git commit -m "feat(seed-starting): add top-bar mode switcher"
```

---

## Phase 3 — Tray Catalog & Store Actions

### Task 7: Tray catalog

**Files:**
- Create: `src/model/trayCatalog.ts`
- Create: `src/model/trayCatalog.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/model/trayCatalog.test.ts
import { describe, expect, it } from 'vitest';
import { TRAY_CATALOG, getTrayPreset, instantiatePreset } from './trayCatalog';

describe('trayCatalog', () => {
  it('catalog includes 1020-36 and 1020-72', () => {
    const ids = TRAY_CATALOG.map((p) => p.id);
    expect(ids).toContain('1020-36');
    expect(ids).toContain('1020-72');
  });

  it('getTrayPreset returns by id', () => {
    expect(getTrayPreset('1020-36')?.rows).toBe(6);
    expect(getTrayPreset('nonexistent')).toBeUndefined();
  });

  it('instantiatePreset produces a tray with the right shape', () => {
    const tray = instantiatePreset('1020-36');
    expect(tray).toBeDefined();
    expect(tray!.rows * tray!.cols).toBe(36);
    expect(tray!.slots).toHaveLength(36);
  });
});
```

- [ ] **Step 2: Implementation**

```typescript
// src/model/trayCatalog.ts
import { type CellSize, createTray, type Tray } from './seedStarting';

export interface TrayPreset {
  id: string;
  label: string;
  rows: number;
  cols: number;
  cellSize: CellSize;
}

export const TRAY_CATALOG: TrayPreset[] = [
  { id: '1020-72', label: '1020 Tray, 72-cell', rows: 8, cols: 9, cellSize: 'small' },
  { id: '1020-36', label: '1020 Tray, 36-cell', rows: 6, cols: 6, cellSize: 'medium' },
  { id: '1020-18', label: '1020 Tray, 18-cell', rows: 3, cols: 6, cellSize: 'large' },
  { id: 'soilblock-2in', label: 'Soil Blocks, 2"', rows: 5, cols: 4, cellSize: 'large' },
];

export function getTrayPreset(id: string): TrayPreset | undefined {
  return TRAY_CATALOG.find((p) => p.id === id);
}

export function instantiatePreset(id: string, label?: string): Tray | undefined {
  const preset = getTrayPreset(id);
  if (!preset) return undefined;
  return createTray({
    rows: preset.rows,
    cols: preset.cols,
    cellSize: preset.cellSize,
    label: label ?? preset.label,
  });
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/model/trayCatalog.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/model/trayCatalog.ts src/model/trayCatalog.test.ts
git commit -m "feat(seed-starting): add tray catalog"
```

---

### Task 8: SeedStarting store actions

**Files:**
- Modify: `src/store/gardenStore.ts`
- Test: `src/store/gardenStore.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/store/gardenStore.test.ts`:

```typescript
import { instantiatePreset } from '../model/trayCatalog';

describe('seed-starting actions', () => {
  beforeEach(() => useGardenStore.getState().reset());

  it('addTray appends a tray and sets currentTrayId', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    expect(useGardenStore.getState().garden.seedStarting.trays).toHaveLength(1);
  });

  it('removeTray removes the tray and orphan seedlings', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil-genovese');
    useGardenStore.getState().removeTray(tray.id);
    expect(useGardenStore.getState().garden.seedStarting.trays).toHaveLength(0);
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(0);
  });

  it('sowCell creates a seedling and marks slot sown', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 1, 2, 'basil-genovese');
    const t = useGardenStore.getState().garden.seedStarting.trays[0];
    expect(t.slots[1 * t.cols + 2].state).toBe('sown');
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(1);
  });

  it('clearCell removes the seedling and resets slot', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil-genovese');
    useGardenStore.getState().clearCell(tray.id, 0, 0);
    const t = useGardenStore.getState().garden.seedStarting.trays[0];
    expect(t.slots[0].state).toBe('empty');
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Add actions to GardenStore interface and implementation**

In `src/store/gardenStore.ts`:

```typescript
import type { Tray } from '../model/seedStarting';
import { createSeedling, getCell, setCell } from '../model/seedStarting';

interface GardenStore {
  // ...existing...
  addTray: (tray: Tray) => void;
  removeTray: (trayId: string) => void;
  sowCell: (trayId: string, row: number, col: number, cultivarId: string) => void;
  clearCell: (trayId: string, row: number, col: number) => void;
}

// In the store body, add:
addTray: (tray) => {
  const { seedStarting } = get().garden;
  commitPatch({
    seedStarting: { ...seedStarting, trays: [...seedStarting.trays, tray] },
  });
},

removeTray: (trayId) => {
  const { seedStarting } = get().garden;
  commitPatch({
    seedStarting: {
      trays: seedStarting.trays.filter((t) => t.id !== trayId),
      seedlings: seedStarting.seedlings.filter((s) => s.trayId !== trayId),
    },
  });
},

sowCell: (trayId, row, col, cultivarId) => {
  const { seedStarting } = get().garden;
  const tray = seedStarting.trays.find((t) => t.id === trayId);
  if (!tray) return;
  const slot = getCell(tray, row, col);
  if (!slot || slot.state !== 'empty') return;
  const seedling = createSeedling({ cultivarId, trayId, row, col });
  const updatedTray = setCell(tray, row, col, { state: 'sown', seedlingId: seedling.id });
  commitPatch({
    seedStarting: {
      trays: seedStarting.trays.map((t) => (t.id === trayId ? updatedTray : t)),
      seedlings: [...seedStarting.seedlings, seedling],
    },
  });
},

clearCell: (trayId, row, col) => {
  const { seedStarting } = get().garden;
  const tray = seedStarting.trays.find((t) => t.id === trayId);
  if (!tray) return;
  const slot = getCell(tray, row, col);
  if (!slot || slot.state === 'empty') return;
  const seedlingId = slot.seedlingId;
  const updatedTray = setCell(tray, row, col, { state: 'empty', seedlingId: null });
  commitPatch({
    seedStarting: {
      trays: seedStarting.trays.map((t) => (t.id === trayId ? updatedTray : t)),
      seedlings: seedStarting.seedlings.filter((s) => s.id !== seedlingId),
    },
  });
},
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/store/gardenStore.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/store/gardenStore.ts src/store/gardenStore.test.ts
git commit -m "feat(seed-starting): add tray/cell store actions with undo"
```

---

## Phase 4 — Tray Switcher & Custom Builder

### Task 9: Tray switcher dropdown

**Files:**
- Create: `src/components/TraySwitcher.tsx`
- Create: `src/styles/TraySwitcher.module.css`
- Modify: `src/components/MenuBar.tsx`

- [ ] **Step 1: Write component**

`src/components/TraySwitcher.tsx`:

```typescript
import { useState } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { TRAY_CATALOG, instantiatePreset } from '../model/trayCatalog';
import styles from '../styles/TraySwitcher.module.css';

interface Props {
  onOpenCustomBuilder: () => void;
}

export function TraySwitcher({ onOpenCustomBuilder }: Props) {
  const trays = useGardenStore((s) => s.garden.seedStarting.trays);
  const addTray = useGardenStore((s) => s.addTray);
  const currentTrayId = useUiStore((s) => s.currentTrayId);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);
  const [open, setOpen] = useState(false);

  const current = trays.find((t) => t.id === currentTrayId);

  function handleNewFromPreset(presetId: string) {
    const tray = instantiatePreset(presetId);
    if (!tray) return;
    addTray(tray);
    setCurrentTrayId(tray.id);
    setOpen(false);
  }

  return (
    <div className={styles.switcher}>
      <button className={styles.trigger} onClick={() => setOpen((v) => !v)}>
        Tray: {current?.label ?? '(none)'} ▾
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {trays.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Your Trays</div>
              {trays.map((t) => (
                <button
                  key={t.id}
                  className={styles.item}
                  onClick={() => {
                    setCurrentTrayId(t.id);
                    setOpen(false);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>New from preset</div>
            {TRAY_CATALOG.map((p) => (
              <button key={p.id} className={styles.item} onClick={() => handleNewFromPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className={styles.section}>
            <button
              className={styles.item}
              onClick={() => {
                setOpen(false);
                onOpenCustomBuilder();
              }}
            >
              Custom tray…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

`src/styles/TraySwitcher.module.css`:

```css
.switcher { position: relative; display: inline-block; margin: 0 12px; }
.trigger { padding: 4px 12px; border: 1px solid currentColor; background: transparent;
  border-radius: 6px; cursor: pointer; font: inherit; color: inherit; }
.menu { position: absolute; top: 100%; left: 0; margin-top: 4px;
  background: var(--menu-bg, #fff); color: #222; border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15); min-width: 220px; z-index: 100;
  padding: 4px 0; }
.section { padding: 4px 0; border-bottom: 1px solid #eee; }
.section:last-child { border-bottom: none; }
.sectionLabel { font-size: 11px; opacity: 0.6; padding: 2px 12px;
  text-transform: uppercase; letter-spacing: 0.05em; }
.item { display: block; width: 100%; text-align: left; padding: 6px 12px;
  border: none; background: transparent; cursor: pointer; font: inherit; color: inherit; }
.item:hover { background: #f0f0f0; }
```

- [ ] **Step 2: Wire into MenuBar (gated by appMode)**

```typescript
// MenuBar.tsx
import { useState } from 'react';
import { useUiStore } from '../store/uiStore';
import { TraySwitcher } from './TraySwitcher';
import { CustomTrayBuilder } from './CustomTrayBuilder';

export function MenuBar() {
  const appMode = useUiStore((s) => s.appMode);
  const [builderOpen, setBuilderOpen] = useState(false);
  // ...existing hooks...

  return (
    <div className={styles.menuBar} /* ... */>
      <div className={styles.title} /* ... */>Garden Planner</div>
      <ModeSwitcher />
      {appMode === 'seed-starting' && (
        <TraySwitcher onOpenCustomBuilder={() => setBuilderOpen(true)} />
      )}
      {/* ...existing dev nav and menus... */}
      {builderOpen && <CustomTrayBuilder onClose={() => setBuilderOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`. Switch to Seed Starting mode, open the dropdown, create a 36-cell preset. Confirm it appears under "Your Trays".

- [ ] **Step 4: Commit**

```bash
git add src/components/TraySwitcher.tsx src/styles/TraySwitcher.module.css src/components/MenuBar.tsx
git commit -m "feat(seed-starting): add tray switcher dropdown"
```

---

### Task 10: Custom tray builder modal

**Files:**
- Create: `src/components/CustomTrayBuilder.tsx`
- Create: `src/styles/CustomTrayBuilder.module.css`

- [ ] **Step 1: Write component**

`src/components/CustomTrayBuilder.tsx`:

```typescript
import { useState } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { type CellSize, CELL_PITCH_IN, createTray } from '../model/seedStarting';
import styles from '../styles/CustomTrayBuilder.module.css';

interface Props {
  onClose: () => void;
}

export function CustomTrayBuilder({ onClose }: Props) {
  const [rows, setRows] = useState(6);
  const [cols, setCols] = useState(6);
  const [cellSize, setCellSize] = useState<CellSize>('medium');
  const [label, setLabel] = useState('Custom Tray');
  const addTray = useGardenStore((s) => s.addTray);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);

  function handleCreate() {
    const tray = createTray({ rows, cols, cellSize, label });
    addTray(tray);
    setCurrentTrayId(tray.id);
    onClose();
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Custom Tray</h3>
        <label className={styles.field}>
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            Rows
            <input type="number" min={1} max={20} value={rows}
              onChange={(e) => setRows(Math.max(1, +e.target.value))} />
          </label>
          <label className={styles.field}>
            Cols
            <input type="number" min={1} max={20} value={cols}
              onChange={(e) => setCols(Math.max(1, +e.target.value))} />
          </label>
        </div>
        <label className={styles.field}>
          Cell size
          <select value={cellSize} onChange={(e) => setCellSize(e.target.value as CellSize)}>
            <option value="small">Small (~{CELL_PITCH_IN.small}")</option>
            <option value="medium">Medium (~{CELL_PITCH_IN.medium}")</option>
            <option value="large">Large (~{CELL_PITCH_IN.large}")</option>
          </select>
        </label>
        <div className={styles.preview}>
          {rows} × {cols} = {rows * cols} cells, {(cols * CELL_PITCH_IN[cellSize]).toFixed(1)}" × {(rows * CELL_PITCH_IN[cellSize]).toFixed(1)}"
        </div>
        <div className={styles.actions}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleCreate}>Create</button>
        </div>
      </div>
    </div>
  );
}
```

`src/styles/CustomTrayBuilder.module.css`:

```css
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 200;
  display: flex; align-items: center; justify-content: center; }
.modal { background: #fff; color: #222; padding: 20px; border-radius: 8px;
  min-width: 320px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
.modal h3 { margin: 0 0 12px; }
.field { display: flex; flex-direction: column; margin-bottom: 12px; gap: 4px; }
.field input, .field select { padding: 4px 8px; font: inherit; }
.row { display: flex; gap: 12px; }
.row .field { flex: 1; }
.preview { padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 13px;
  margin-bottom: 12px; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.actions button { padding: 6px 16px; cursor: pointer; }
```

- [ ] **Step 2: Verify in browser**

Open the builder via "Custom tray…" in the dropdown, create a 4×8 medium tray, confirm it's selected.

- [ ] **Step 3: Commit**

```bash
git add src/components/CustomTrayBuilder.tsx src/styles/CustomTrayBuilder.module.css
git commit -m "feat(seed-starting): add custom tray builder modal"
```

---

## Phase 5 — Seed-Starting Canvas Rendering

### Task 11: Tray + cell render layer

**Files:**
- Create: `src/canvas/layers/trayLayers.ts`
- Test: `src/canvas/layers/trayLayers.test.ts`

- [ ] **Step 1: Write failing test (data-shape, not pixels)**

```typescript
// src/canvas/layers/trayLayers.test.ts
import { describe, expect, it } from 'vitest';
import { createTray } from '../../model/seedStarting';
import { computeCellRectsIn } from './trayLayers';

describe('computeCellRectsIn', () => {
  it('returns rows*cols rects in inch coordinates', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    const rects = computeCellRectsIn(tray);
    expect(rects).toHaveLength(6);
    expect(rects[0]).toMatchObject({ row: 0, col: 0 });
    expect(rects[5]).toMatchObject({ row: 1, col: 2 });
    // Cell width should equal pitch
    expect(rects[0].widthIn).toBeCloseTo(tray.cellPitchIn);
  });
});
```

- [ ] **Step 2: Implement layer functions**

```typescript
// src/canvas/layers/trayLayers.ts
import type { Tray } from '../../model/seedStarting';

export interface CellRect {
  row: number;
  col: number;
  /** Inch-space rect (origin at tray top-left). */
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

export function computeCellRectsIn(tray: Tray): CellRect[] {
  const out: CellRect[] = [];
  const p = tray.cellPitchIn;
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      out.push({
        row: r,
        col: c,
        xIn: c * p,
        yIn: r * p,
        widthIn: p,
        heightIn: p,
      });
    }
  }
  return out;
}

/** Render the tray outline + cell grid. ctx is in screen pixels; pass pxPerInch. */
export function renderTrayBase(
  ctx: CanvasRenderingContext2D,
  tray: Tray,
  pxPerInch: number,
  originX: number,
  originY: number,
) {
  const w = tray.widthIn * pxPerInch;
  const h = tray.heightIn * pxPerInch;

  // Tray body
  ctx.fillStyle = '#3a2e22';
  ctx.fillRect(originX, originY, w, h);

  // Cell grid
  ctx.strokeStyle = '#1a1410';
  ctx.lineWidth = 1;
  const p = tray.cellPitchIn * pxPerInch;
  for (let c = 0; c <= tray.cols; c++) {
    const x = originX + c * p;
    ctx.beginPath();
    ctx.moveTo(x, originY);
    ctx.lineTo(x, originY + h);
    ctx.stroke();
  }
  for (let r = 0; r <= tray.rows; r++) {
    const y = originY + r * p;
    ctx.beginPath();
    ctx.moveTo(originX, y);
    ctx.lineTo(originX + w, y);
    ctx.stroke();
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/canvas/layers/trayLayers.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/canvas/layers/trayLayers.ts src/canvas/layers/trayLayers.test.ts
git commit -m "feat(seed-starting): add tray+cell render layer"
```

---

### Task 12: Seedling render layer

**Files:**
- Create: `src/canvas/layers/seedlingLayers.ts`
- Test: `src/canvas/layers/seedlingLayers.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/canvas/layers/seedlingLayers.test.ts
import { describe, expect, it } from 'vitest';
import { createSeedling, createTray, setCell } from '../../model/seedStarting';
import { collectSownCells } from './seedlingLayers';

describe('collectSownCells', () => {
  it('returns one entry per sown cell with its seedling+cultivar', () => {
    let tray = createTray({ rows: 2, cols: 2, cellSize: 'small', label: 't' });
    const seedling = createSeedling({ cultivarId: 'basil-genovese', trayId: tray.id, row: 0, col: 1 });
    tray = setCell(tray, 0, 1, { state: 'sown', seedlingId: seedling.id });
    const result = collectSownCells(tray, [seedling]);
    expect(result).toHaveLength(1);
    expect(result[0].row).toBe(0);
    expect(result[0].col).toBe(1);
    expect(result[0].seedling).toBe(seedling);
  });
});
```

- [ ] **Step 2: Implementation**

```typescript
// src/canvas/layers/seedlingLayers.ts
import type { Seedling, Tray } from '../../model/seedStarting';
import { getCultivar } from '../../model/cultivars';

export interface SownCellEntry {
  row: number;
  col: number;
  seedling: Seedling;
}

export function collectSownCells(tray: Tray, seedlings: Seedling[]): SownCellEntry[] {
  const byId = new Map(seedlings.map((s) => [s.id, s]));
  const out: SownCellEntry[] = [];
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      const slot = tray.slots[r * tray.cols + c];
      if (slot.state !== 'sown' || !slot.seedlingId) continue;
      const seedling = byId.get(slot.seedlingId);
      if (seedling) out.push({ row: r, col: c, seedling });
    }
  }
  return out;
}

export function renderSeedlings(
  ctx: CanvasRenderingContext2D,
  tray: Tray,
  seedlings: Seedling[],
  pxPerInch: number,
  originX: number,
  originY: number,
  options: { showLabel: boolean },
) {
  const p = tray.cellPitchIn * pxPerInch;
  for (const { row, col, seedling } of collectSownCells(tray, seedlings)) {
    const cultivar = getCultivar(seedling.cultivarId);
    if (!cultivar) continue;
    const cx = originX + col * p + p / 2;
    const cy = originY + row * p + p / 2;
    const radius = (p * 0.7) / 2;

    // Background swatch
    ctx.fillStyle = cultivar.color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Optional label
    if (options.showLabel) {
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(8, p * 0.22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = seedling.labelOverride ?? cultivar.name.slice(0, 4);
      ctx.fillText(label, cx, cy);
    }
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/canvas/layers/seedlingLayers.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/canvas/layers/seedlingLayers.ts src/canvas/layers/seedlingLayers.test.ts
git commit -m "feat(seed-starting): add seedling render layer"
```

---

### Task 13: Mode-aware CanvasStack

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`

This is the largest single edit; the existing `CanvasStack` is ~25KB. Approach: add a top-level branch on `appMode`. When `'seed-starting'`, render only the tray + seedling layers using inch-scale view state (`seedStartingZoom`/`Pan`). When `'garden'`, behavior is unchanged.

- [ ] **Step 1: Read current CanvasStack to identify the canvas-render hook**

```bash
wc -l src/canvas/CanvasStack.tsx
# inspect the main render function & the useEffect that draws layers
```

- [ ] **Step 2: Add a sibling render path**

Inside `CanvasStack.tsx`, the existing layers iterate over garden structures/zones/plantings. Add an early branch:

```typescript
import { useUiStore } from '../store/uiStore';
import { renderTrayBase } from './layers/trayLayers';
import { renderSeedlings } from './layers/seedlingLayers';

// Inside the canvas-draw effect:
const appMode = useUiStore((s) => s.appMode);
const currentTrayId = useUiStore((s) => s.currentTrayId);
const showSeedlingLabels = useUiStore((s) => s.renderLayerVisibility['seedling-labels'] ?? false);

if (appMode === 'seed-starting') {
  const seedZoom = useUiStore.getState().seedStartingZoom;
  const seedPanX = useUiStore.getState().seedStartingPanX;
  const seedPanY = useUiStore.getState().seedStartingPanY;
  const tray = garden.seedStarting.trays.find((t) => t.id === currentTrayId);
  if (!tray) {
    // Empty state: show "Create a tray to get started" hint
    ctx.fillStyle = '#888';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No tray selected. Use the Tray menu to create one.',
      canvas.width / 2, canvas.height / 2);
    return;
  }
  // Center the tray on canvas, applying pan/zoom
  const pxPerInch = seedZoom;  // explicit unit: pixels per inch
  const trayPxW = tray.widthIn * pxPerInch;
  const trayPxH = tray.heightIn * pxPerInch;
  const originX = (canvas.width - trayPxW) / 2 + seedPanX;
  const originY = (canvas.height - trayPxH) / 2 + seedPanY;
  renderTrayBase(ctx, tray, pxPerInch, originX, originY);
  renderSeedlings(ctx, tray, garden.seedStarting.seedlings,
    pxPerInch, originX, originY, { showLabel: showSeedlingLabels });
  return;
}

// ...existing garden render path follows...
```

- [ ] **Step 3: Re-run dev, switch modes manually**

Run: `npm run dev`. Switch to Seed Starting, create a 36-cell tray, confirm it renders centered. Switch back to Garden, confirm garden still renders.

- [ ] **Step 4: Type-check + tests**

Run: `npm run build`
Run: `npx vitest run`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/CanvasStack.tsx
git commit -m "feat(seed-starting): render tray + seedlings in seed-starting mode"
```

---

## Phase 6 — Sidebar Palette

### Task 14: Filtered cultivar palette + tray palette

**Files:**
- Create: `src/components/palette/SeedStartingPalette.tsx`
- Modify: `src/components/App.tsx`

The garden palette already supports plantings via `ObjectPalette` + `paletteData`. For seed-starting, we filter by `cultivar.seedStarting.startable` and add tray-creation entries styled to match.

- [ ] **Step 1: Build SeedStartingPalette**

`src/components/palette/SeedStartingPalette.tsx`:

```typescript
import { useMemo, useState } from 'react';
import { getAllCultivars } from '../../model/cultivars';
import { getSpecies } from '../../model/species';
import { TRAY_CATALOG } from '../../model/trayCatalog';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { instantiatePreset } from '../../model/trayCatalog';
import { useActiveTheme } from '../../hooks/useActiveTheme';
import paletteStyles from '../../styles/ObjectPalette.module.css';
import type { PaletteEntry } from './paletteData';
import { PaletteItem, PlantingLeafRow, PlantingParentRow, PlantingChildRow } from './PaletteItem';
import { usePlantingTree } from './usePlantingTree';

interface Props {
  onDragBegin: (entry: PaletteEntry, e: React.PointerEvent) => void;
}

export function SeedStartingPalette({ onDragBegin }: Props) {
  const [search, setSearch] = useState('');
  const { theme, transitionDuration: dur } = useActiveTheme();
  const addTray = useGardenStore((s) => s.addTray);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);

  // Trays styled like structure palette items
  const trayEntries: PaletteEntry[] = useMemo(
    () =>
      TRAY_CATALOG.map((p) => ({
        id: `tray:${p.id}`,
        name: p.label,
        category: 'structures' as const,
        type: `tray:${p.id}`,
        defaultWidth: p.cols,
        defaultHeight: p.rows,
        color: '#3a2e22',
      })),
    [],
  );

  // Plantings filtered by seedStarting.startable
  const plantingEntries: PaletteEntry[] = useMemo(
    () =>
      getAllCultivars()
        .filter((c) => c.seedStarting.startable)
        .map((c) => {
          const species = getSpecies(c.speciesId);
          return {
            id: c.id,
            name: c.name,
            category: 'plantings' as const,
            speciesId: c.speciesId,
            speciesName: species?.name ?? c.speciesId,
            varietyLabel: c.variety ?? c.name,
            type: 'planting',
            defaultWidth: 0,
            defaultHeight: 0,
            color: c.color,
          };
        })
        .filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase())),
    [search],
  );

  const { tree, expanded, toggle } = usePlantingTree(plantingEntries, search.length > 0);

  function handleTrayClick(presetId: string) {
    const id = presetId.replace(/^tray:/, '');
    const tray = instantiatePreset(id);
    if (!tray) return;
    addTray(tray);
    setCurrentTrayId(tray.id);
  }

  return (
    <div className={paletteStyles.palette}>
      <div className={paletteStyles.search}>
        <input
          className={paletteStyles.searchInput}
          type="text"
          placeholder="Search seedables…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className={paletteStyles.scrollArea}>
        <div className={paletteStyles.category}>
          <div className={paletteStyles.categoryLabel}
               style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}>
            Trays
          </div>
          <div className={paletteStyles.itemGrid}
               style={{ '--list-hover': theme.listHover } as React.CSSProperties}>
            {trayEntries.map((entry) => (
              <PaletteItem
                key={entry.id}
                entry={entry}
                onDragBegin={(e) => handleTrayClick(e.id)}
              />
            ))}
          </div>
        </div>

        <div className={paletteStyles.category}>
          <div className={paletteStyles.categoryLabel}
               style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}>
            Seedables
          </div>
          <div className={paletteStyles.treeContainer}
               style={{ '--list-hover': theme.listHover } as React.CSSProperties}>
            {tree.map((node) => {
              if (node.kind === 'leaf') {
                return <PlantingLeafRow key={node.entry.id} entry={node.entry} onDragBegin={onDragBegin} />;
              }
              const isExpanded = expanded.has(node.speciesId);
              return (
                <div key={node.speciesId}
                     className={`${paletteStyles.lozenge} ${isExpanded ? paletteStyles.lozengeExpanded : ''}`}>
                  <PlantingParentRow node={node} expanded={isExpanded} onToggle={() => toggle(node.speciesId)} />
                  {isExpanded && node.children.map((child) => (
                    <PlantingChildRow key={child.entry.id} entry={child.entry} onDragBegin={onDragBegin} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
```

(Note: tray "drag" is downgraded to click-to-add for v1; trays don't drag onto canvas because mode has single-tray focus. The `onDragBegin` prop on `PaletteItem` is reused as a click trigger here. If `PaletteItem`'s API doesn't fit, swap in a simple `<button>` styled the same way.)

- [ ] **Step 2: Render the right palette in App.tsx**

In `src/components/App.tsx`:

```typescript
import { SeedStartingPalette } from './palette/SeedStartingPalette';
import { useUiStore } from '../store/uiStore';

const appMode = useUiStore((s) => s.appMode);

// In the JSX:
<div className={styles.palette}>
  {appMode === 'garden'
    ? <ObjectPalette onDragBegin={handlePaletteDragBegin} />
    : <SeedStartingPalette onDragBegin={handleSeedDragBegin} />}
</div>
```

`handleSeedDragBegin` is implemented in Task 15.

- [ ] **Step 3: Verify in browser**

Switch to Seed Starting; confirm the palette shows Trays at top and a filtered seedables list below. Click a tray preset → tray is created and shown.

- [ ] **Step 4: Commit**

```bash
git add src/components/palette/SeedStartingPalette.tsx src/components/App.tsx
git commit -m "feat(seed-starting): add seed-starting sidebar palette"
```

---

## Phase 7 — Drag-onto-Cell Sowing

### Task 15: Cell hit-test

**Files:**
- Create: `src/canvas/seedStartingHitTest.ts`
- Test: `src/canvas/seedStartingHitTest.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/canvas/seedStartingHitTest.test.ts
import { describe, expect, it } from 'vitest';
import { createTray } from '../model/seedStarting';
import { hitTestCell, type SeedStartingViewport } from './seedStartingHitTest';

const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
const viewport: SeedStartingViewport = {
  pxPerInch: 30,
  originX: 100,
  originY: 100,
};

describe('hitTestCell', () => {
  it('hits cell (0,0) near top-left', () => {
    const r = hitTestCell(tray, viewport, 110, 110);
    expect(r).toEqual({ row: 0, col: 0 });
  });

  it('hits cell (1,2) at bottom-right', () => {
    const cx = 100 + 2 * 1.5 * 30 + 5;
    const cy = 100 + 1 * 1.5 * 30 + 5;
    expect(hitTestCell(tray, viewport, cx, cy)).toEqual({ row: 1, col: 2 });
  });

  it('returns null outside the tray', () => {
    expect(hitTestCell(tray, viewport, 0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Implementation**

```typescript
// src/canvas/seedStartingHitTest.ts
import type { Tray } from '../model/seedStarting';

export interface SeedStartingViewport {
  pxPerInch: number;
  originX: number;
  originY: number;
}

export interface CellHit {
  row: number;
  col: number;
}

export function hitTestCell(
  tray: Tray,
  viewport: SeedStartingViewport,
  screenX: number,
  screenY: number,
): CellHit | null {
  const localX = screenX - viewport.originX;
  const localY = screenY - viewport.originY;
  if (localX < 0 || localY < 0) return null;
  const totalW = tray.cols * tray.cellPitchIn * viewport.pxPerInch;
  const totalH = tray.rows * tray.cellPitchIn * viewport.pxPerInch;
  if (localX >= totalW || localY >= totalH) return null;
  const cellPx = tray.cellPitchIn * viewport.pxPerInch;
  return { row: Math.floor(localY / cellPx), col: Math.floor(localX / cellPx) };
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/canvas/seedStartingHitTest.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/canvas/seedStartingHitTest.ts src/canvas/seedStartingHitTest.test.ts
git commit -m "feat(seed-starting): add cell hit-test"
```

---

### Task 16: Drag species → cell handler

**Files:**
- Modify: `src/components/App.tsx`

- [ ] **Step 1: Add handleSeedDragBegin**

In `src/components/App.tsx`:

```typescript
import { hitTestCell } from '../canvas/seedStartingHitTest';

const handleSeedDragBegin = useCallback((entry: PaletteEntry, e: React.PointerEvent) => {
  if (entry.category !== 'plantings') return;
  const startX = e.clientX;
  const startY = e.clientY;
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const THRESHOLD = 4;
  let dragging = false;

  function viewport(): { rect: DOMRect; vp: ReturnType<typeof currentViewport> } | null {
    const el = document.querySelector('[data-canvas-container]') as HTMLElement | null;
    const rect = el?.getBoundingClientRect();
    if (!rect) return null;
    return { rect, vp: currentViewport(rect) };
  }

  function currentViewport(rect: DOMRect) {
    const ui = useUiStore.getState();
    const garden = useGardenStore.getState().garden;
    const tray = garden.seedStarting.trays.find((t) => t.id === ui.currentTrayId);
    if (!tray) return null;
    const trayPxW = tray.widthIn * ui.seedStartingZoom;
    const trayPxH = tray.heightIn * ui.seedStartingZoom;
    return {
      tray,
      pxPerInch: ui.seedStartingZoom,
      originX: (rect.width - trayPxW) / 2 + ui.seedStartingPanX,
      originY: (rect.height - trayPxH) / 2 + ui.seedStartingPanY,
    };
  }

  function onMove(ev: PointerEvent) {
    if (!dragging) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
      dragging = true;
    }
    // (Optional: visual hover preview — skipped in v1 to keep scope tight.)
  }

  function onUp(ev: PointerEvent) {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    target.releasePointerCapture(ev.pointerId);
    if (!dragging) return;

    const v = viewport();
    if (!v || !v.vp) return;
    const sx = ev.clientX - v.rect.left;
    const sy = ev.clientY - v.rect.top;
    const hit = hitTestCell(v.vp.tray, v.vp, sx, sy);
    if (!hit) return;
    useGardenStore.getState().sowCell(v.vp.tray.id, hit.row, hit.col, entry.id);
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}, []);
```

- [ ] **Step 2: Verify in browser**

Add a few cultivars with `seedStarting.startable: true` (edit `src/data/cultivars.json` for testing — pick 2–3 herbs/veggies). Switch to Seed Starting, drag one onto a cell. Confirm it appears as a colored swatch.

- [ ] **Step 3: Build + test**

Run: `npm run build && npx vitest run`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/App.tsx
git commit -m "feat(seed-starting): drag species onto cell to sow"
```

---

### Task 17: Seed a few cultivars as startable

**Files:**
- Modify: `src/data/cultivars.json` (small surgical edit) or `src/data/species.json`

- [ ] **Step 1: Pick 5–10 species and mark startable**

Edit `src/data/species.json` (smaller per-edit) — find entries for: basil, tomato, pepper, lettuce, kale, broccoli, parsley, chard. Add to each:

```json
{
  ...,
  "seedStarting": { "startable": true, "cellSize": "medium" }
}
```

(For tomato/pepper, use `cellSize: "large"`; for basil/lettuce/parsley, `"small"` is fine.)

- [ ] **Step 2: Verify the palette filter shows them**

Run: `npm run dev`. Switch to Seed Starting, confirm Seedables list shows the 8 species (with their cultivar children).

- [ ] **Step 3: Commit**

```bash
git add src/data/species.json
git commit -m "data(seed-starting): mark common starts as startable"
```

---

## Phase 8 — Polish & Stretch

### Task 18: Render-layers panel for seed-starting layers

**Files:**
- Modify: `src/components/sidebar/RenderLayersPanel.tsx`
- Modify: `src/store/uiStore.ts` (default visibility for new layers)

- [ ] **Step 1: Add seed-starting layer toggles**

In `defaultState()` in `uiStore.ts`, append to `renderLayerVisibility`:

```typescript
'seedling-labels': false,
'tray-grid': true,
```

- [ ] **Step 2: Show appropriate toggles per mode**

In `RenderLayersPanel.tsx`, switch the rendered list based on `appMode`:

```typescript
const appMode = useUiStore((s) => s.appMode);

const layers = appMode === 'seed-starting'
  ? [
      { id: 'tray-grid', label: 'Tray cell grid' },
      { id: 'seedling-labels', label: 'Seedling labels' },
    ]
  : [
      // ...existing garden layer entries...
    ];
```

- [ ] **Step 3: Honor the toggles in renderers**

Update `CanvasStack.tsx` seed-mode branch to read `tray-grid` visibility — if false, skip drawing the inner cell lines (still draw outline).

- [ ] **Step 4: Verify in browser**

Toggle "Seedling labels" on; labels appear on sown cells.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/RenderLayersPanel.tsx src/store/uiStore.ts src/canvas/CanvasStack.tsx
git commit -m "feat(seed-starting): mode-aware render-layers panel"
```

---

### Task 19 (stretch): Fill-tray drag

**Files:**
- Modify: `src/components/App.tsx`
- Modify: `src/store/gardenStore.ts` (add `fillTray` action)

- [ ] **Step 1: Add fillTray action**

```typescript
fillTray: (trayId, cultivarId) => {
  const { seedStarting } = get().garden;
  const tray = seedStarting.trays.find((t) => t.id === trayId);
  if (!tray) return;
  let updatedTray = tray;
  const newSeedlings: Seedling[] = [];
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      const slot = updatedTray.slots[r * tray.cols + c];
      if (slot.state !== 'empty') continue;
      const seedling = createSeedling({ cultivarId, trayId, row: r, col: c });
      newSeedlings.push(seedling);
      updatedTray = setCell(updatedTray, r, c, { state: 'sown', seedlingId: seedling.id });
    }
  }
  commitPatch({
    seedStarting: {
      trays: seedStarting.trays.map((t) => (t.id === trayId ? updatedTray : t)),
      seedlings: [...seedStarting.seedlings, ...newSeedlings],
    },
  });
},
```

Add corresponding test.

- [ ] **Step 2: UX trigger**

Easiest: Shift+drop on the tray (not a cell). Detect in `handleSeedDragBegin`'s `onUp`:

```typescript
const ev = ...;
if (ev.shiftKey) {
  useGardenStore.getState().fillTray(v.vp.tray.id, entry.id);
} else if (hit) {
  useGardenStore.getState().sowCell(...);
}
```

- [ ] **Step 3: Verify**

Shift-drop basil on a 36-cell tray; all 36 cells fill.

- [ ] **Step 4: Commit**

```bash
git add src/store/gardenStore.ts src/store/gardenStore.test.ts src/components/App.tsx
git commit -m "feat(seed-starting): shift+drop fills empty cells"
```

---

### Task 20: Final verification & docs

**Files:**
- Modify: `docs/behavior.md` — record seed-starting behavior

- [ ] **Step 1: Append to `docs/behavior.md`**

Add a "Seed Starting" section with declarative statements:
- "App has two modes: Garden and Seed Starting, switched via top-bar tabs."
- "Seed Starting mode displays one tray at a time; tray switcher in top bar."
- "Trays are created from a catalog of presets or via the Custom Tray dialog."
- "Cells are sown by dragging a startable cultivar from the sidebar onto the cell."
- "Shift+drop on a tray fills all empty cells with the dragged cultivar."
- "Seed-starting state is saved alongside the garden in the same file under `seedStarting`."

- [ ] **Step 2: Full build + test sweep**

Run: `npm run build && npx vitest run`
Expected: clean.

- [ ] **Step 3: Browser smoke test**

- Switch modes both directions
- Create preset tray, custom tray
- Sow a cell, fill a tray
- Save the garden, reload, confirm seedlings persist
- Undo/redo a sow

- [ ] **Step 4: Commit**

```bash
git add docs/behavior.md
git commit -m "docs(seed-starting): record v1 behavior"
```

---

## Self-Review Notes

- Spec coverage cross-check: every brainstorm decision (mode toggle, single-tray, inches, persistent identity, combined save, shared renderer, sidebar palette filter, drag-onto-cell, optional label, defer transplant, defer sow date) has a corresponding task.
- Type consistency: `Tray.cellPitchIn` / `Tray.widthIn` / `Tray.heightIn` and `SeedStartingViewport.pxPerInch` / `originX` / `originY` are used consistently across Tasks 11, 12, 13, 15, 16.
- No placeholders: every code step includes the actual code; no "TBD" or "similar to above".

## Risks / Follow-ups

- **Per-mode zoom bounds:** existing `MIN_ZOOM=10`, `MAX_ZOOM=200` apply to the `zoom` field; for seed mode we want px/inch in the 5–100 range. If clamping fights us, split into `setSeedStartingZoom` with its own bounds (already done in Task 5 — verify in practice).
- **Tray palette as drag vs click:** Task 14 turns tray palette items into click-to-add. If you decide trays should drag too (for future multi-tray mode), revisit `SeedStartingPalette` then.
- **`PaletteItem` API:** if `PaletteItem` insists on drag semantics, fall back to a simple styled button matching the same CSS module classes.
- **CanvasStack edit (Task 13):** the existing file is large; the early-return branch should be added near the top of the draw effect to avoid pulling garden-mode draw logic into seed mode.
