# Container Layout Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the arrangement/optimizer system entirely and replace it with three working layout modes: single, grid, and snap-points.

**Architecture:** New `layout.ts` defines the `Layout` union type and `getSlots` (for single/snap-points). Grid containers use weasel's `gridSnapStrategy` for snapping and compute cell centers inline. All arrangement.ts consumers are updated to use Layout, then arrangement.ts and the optimizer are deleted.

**Tech Stack:** TypeScript, Vitest, React, @orochi235/weasel

---

## File Map

**Create:**
- `src/model/layout.ts` — `Layout` type, `ParentBounds`, `getSlots`
- `src/model/layout.test.ts` — unit tests for `getSlots`

**Modify:**
- `src/model/types.ts` — `Structure`/`Zone`: `arrangement` → `layout`; import `ParentBounds` from layout.ts; remove `trellisEdge` from Structure; update factory defaults
- `src/model/containerOverlay.ts` — import from layout.ts; remove grid-line logic; grid mode returns empty (weasel owns it)
- `src/canvas/adapters/plantingLayout.ts` — rewrite for Layout; grid → cell centers + `gridSnapStrategy`; single/snap-points → `getSlots`
- `src/canvas/findSnapContainer.ts` — rename `arrangement` → `layout`; update null check and `'free'` check to absent layout
- `src/canvas/layers/plantingLayersWorld.ts` — rename `arrangement` → `layout`; update `isSingleFill` check
- `src/store/gardenStore.ts` — update `rearrangePlantings`; rename `arrangement` → `layout` in commit functions; remove `applyOptimizerResult`
- `src/components/sidebar/PropertiesPanel.tsx` — remove all arrangement UI; add layout picker + cell size input

**Delete (Task 9):**
- `src/model/arrangement.ts`
- `src/model/arrangementStrategies/` (squareFoot.ts, hex.ts, bandedRows.ts, trellisedBack.ts, multi.ts + all test files)
- `src/optimizer/` (entire directory)
- `src/model/cultivarSpacing.ts`
- `src/components/sidebar/OptimizePanel.tsx`
- `src/components/optimizer/` (OptimizerWizard.tsx, runOptimizerForBed.ts, runOptimizerForBed.test.ts)
- `docs/superpowers/specs/2026-05-04-raised-bed-layout-strategies-design.md`
- `docs/superpowers/specs/2026-05-05-optimizer-auto-clustering-design.md`

---

## Task 1: Create layout.ts

**Files:**
- Create: `src/model/layout.ts`

- [ ] **Step 1: Write layout.ts**

```ts
export interface ParentBounds {
  x: number;
  y: number;
  width: number;
  length: number;
  shape: 'rectangle' | 'circle';
}

export type Layout =
  | { type: 'single' }
  | { type: 'grid'; cellSizeFt: number }
  | { type: 'snap-points'; points: { x: number; y: number }[] };

export type LayoutType = Layout['type'];

/**
 * Returns slot positions (world space) for single and snap-points modes.
 * Grid mode is handled by the canvas adapter (weasel grid snap).
 */
export function getSlots(
  layout: Layout,
  bounds: ParentBounds,
): { x: number; y: number }[] {
  switch (layout.type) {
    case 'single':
      return [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.length / 2 }];
    case 'snap-points':
      return layout.points.map((p) => ({ x: bounds.x + p.x, y: bounds.y + p.y }));
    case 'grid':
      return getGridCells(layout.cellSizeFt, bounds);
  }
}

/** Cell centers tiling the bounds at cellSizeFt pitch. */
export function getGridCells(
  cellSizeFt: number,
  bounds: ParentBounds,
): { x: number; y: number }[] {
  if (cellSizeFt <= 0) return [];
  const cols = Math.floor(bounds.width / cellSizeFt);
  const rows = Math.floor(bounds.length / cellSizeFt);
  const offsetX = (bounds.width - cols * cellSizeFt) / 2;
  const offsetY = (bounds.length - rows * cellSizeFt) / 2;
  const pts: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push({
        x: bounds.x + offsetX + c * cellSizeFt + cellSizeFt / 2,
        y: bounds.y + offsetY + r * cellSizeFt + cellSizeFt / 2,
      });
    }
  }
  return pts;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/model/layout.ts
git commit -m "feat: add Layout model with getSlots and getGridCells"
```

---

## Task 2: Tests for layout.ts

**Files:**
- Create: `src/model/layout.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, it, expect } from 'vitest';
import { getSlots, getGridCells, type ParentBounds } from './layout';

const rect: ParentBounds = { x: 0, y: 0, width: 4, length: 4, shape: 'rectangle' };

describe('getSlots – single', () => {
  it('returns center of bounds', () => {
    expect(getSlots({ type: 'single' }, rect)).toEqual([{ x: 2, y: 2 }]);
  });

  it('handles non-zero origin', () => {
    const b: ParentBounds = { x: 10, y: 5, width: 4, length: 4, shape: 'rectangle' };
    expect(getSlots({ type: 'single' }, b)).toEqual([{ x: 12, y: 7 }]);
  });
});

describe('getSlots – snap-points', () => {
  it('returns stored points offset by bounds origin', () => {
    const result = getSlots(
      { type: 'snap-points', points: [{ x: 1, y: 1 }, { x: 3, y: 3 }] },
      rect,
    );
    expect(result).toEqual([{ x: 1, y: 1 }, { x: 3, y: 3 }]);
  });

  it('returns empty list for no points', () => {
    expect(getSlots({ type: 'snap-points', points: [] }, rect)).toEqual([]);
  });
});

describe('getGridCells', () => {
  it('produces correct count for clean divisions', () => {
    // 4ft x 4ft bounds, 1ft cells → 4×4 = 16 cells
    expect(getGridCells(1, rect)).toHaveLength(16);
  });

  it('centers cells within bounds', () => {
    // 4ft x 4ft, 2ft cells → 4 cells at (1,1),(3,1),(1,3),(3,3)
    const cells = getGridCells(2, rect);
    expect(cells).toHaveLength(4);
    expect(cells[0]).toEqual({ x: 1, y: 1 });
    expect(cells[1]).toEqual({ x: 3, y: 1 });
    expect(cells[2]).toEqual({ x: 1, y: 3 });
    expect(cells[3]).toEqual({ x: 3, y: 3 });
  });

  it('returns empty for zero cell size', () => {
    expect(getGridCells(0, rect)).toEqual([]);
  });

  it('handles partial fit (floors to whole cells)', () => {
    // 3ft wide, 2ft cells → 1 col (floor(3/2)=1), center at x=1.5
    const b: ParentBounds = { x: 0, y: 0, width: 3, length: 2, shape: 'rectangle' };
    const cells = getGridCells(2, b);
    expect(cells).toHaveLength(1);
    expect(cells[0].x).toBeCloseTo(1.5);
    expect(cells[0].y).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/mike/src/eric && npm test -- src/model/layout.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/model/layout.test.ts
git commit -m "test: layout getSlots and getGridCells"
```

---

## Task 3: Update types.ts

**Files:**
- Modify: `src/model/types.ts`

- [ ] **Step 1: Update imports and Structure/Zone types**

Replace the import at the top:
```ts
// Remove:
import type { Arrangement, ParentBounds } from './arrangement';
import { defaultArrangement } from './arrangement';

// Add:
import type { Layout, ParentBounds } from './layout';
```

On `Structure`, replace:
```ts
// Remove:
  arrangement: Arrangement | null;
  trellisEdge: 'N' | 'E' | 'S' | 'W' | null;

// Add:
  layout: Layout | null;
```

On `Zone`, replace:
```ts
// Remove:
  arrangement: Arrangement | null;

// Add:
  layout: Layout | null;
```

- [ ] **Step 2: Update factory defaults**

Find `DEFAULT_ARRANGEMENTS` and the structure/zone factory functions. Replace:

```ts
// Remove DEFAULT_ARRANGEMENTS block entirely.

// In createStructure (around line 182), change:
//   arrangement: DEFAULT_ARRANGEMENTS[opts.type]?.() ?? null,
//   trellisEdge: null,
// to:
  layout: opts.type === 'pot' || opts.type === 'felt-planter'
    ? { type: 'single' }
    : opts.type === 'raised-bed'
    ? { type: 'grid', cellSizeFt: 1 }
    : null,
```

In `createZone` (around line 202), change:
```ts
// Remove:
  arrangement: defaultArrangement('grid'),
// Add:
  layout: { type: 'grid', cellSizeFt: 1 },
```

- [ ] **Step 3: Update getPlantableBounds**

`getPlantableBounds` currently takes `wallThicknessFt` for margin. Its return type references `ParentBounds` from arrangement.ts. Now it imports from layout.ts. No other changes needed to the function body — just verify the import compiles.

- [ ] **Step 4: Commit**

```bash
git add src/model/types.ts
git commit -m "refactor: replace arrangement with layout on Structure and Zone"
```

---

## Task 4: Update gardenStore.ts

**Files:**
- Modify: `src/store/gardenStore.ts`

- [ ] **Step 1: Update imports**

```ts
// Remove:
import { computeSlots } from '../model/arrangement';
import type { Arrangement } from '../model/arrangement';

// Add:
import { getSlots, getGridCells } from '../model/layout';
import type { Layout } from '../model/layout';
```

- [ ] **Step 2: Rewrite rearrangePlantings**

Replace the function body (roughly lines 238–260):

```ts
function rearrangePlantings(
  plantings: Planting[],
  parentId: string,
  parent: { x: number; y: number; width: number; length: number; shape?: string; layout: Layout | null; wallThicknessFt?: number },
): Planting[] {
  const layout = parent.layout;
  if (!layout) return plantings;

  const bounds = getPlantableBounds(parent);

  let slots: { x: number; y: number }[];
  if (layout.type === 'grid') {
    slots = getGridCells(layout.cellSizeFt, bounds);
  } else {
    slots = getSlots(layout, bounds);
  }

  const children = plantings.filter((p) => p.parentId === parentId);
  const others = plantings.filter((p) => p.parentId !== parentId);
  const rearranged = children.map((p, i) => {
    if (i >= slots.length) return p;
    const local = worldToLocalForParent(parent, slots[i].x, slots[i].y);
    return { ...p, x: local.x, y: local.y };
  });
  return [...others, ...rearranged];
}
```

- [ ] **Step 3: Update commitStructureUpdate and commitZoneUpdate**

In `commitStructureUpdate`, change:
```ts
// Remove:
if ('arrangement' in updates) {
// Add:
if ('layout' in updates) {
```

In `commitZoneUpdate`, same change:
```ts
// Remove:
if ('arrangement' in updates) {
// Add:
if ('layout' in updates) {
```

- [ ] **Step 4: Remove applyOptimizerResult**

Remove the method from the store interface declaration (line ~90) and its implementation (lines ~429–449).

- [ ] **Step 5: Commit**

```bash
git add src/store/gardenStore.ts
git commit -m "refactor: gardenStore uses Layout; remove applyOptimizerResult"
```

---

## Task 5: Rewrite plantingLayout.ts

**Files:**
- Modify: `src/canvas/adapters/plantingLayout.ts`

- [ ] **Step 1: Update imports**

```ts
// Remove:
import { computeSlots, type Arrangement } from '../../model/arrangement';

// Add:
import { getSlots, getGridCells, type Layout } from '../../model/layout';
import { gridSnapStrategy } from '@orochi235/weasel';
```

- [ ] **Step 2: Update Container type**

```ts
// Remove:
type Container = (Structure | Zone) & { arrangement: Arrangement | null };

// Add:
type Container = (Structure | Zone) & { layout: Layout | null };
```

- [ ] **Step 3: Update findContainer guard**

```ts
// Remove:
if (!probe || !probe.arrangement) return null;

// Add:
if (!probe || !probe.layout) return null;
```

- [ ] **Step 4: Update getDropTargets**

Replace the getDropTargets body:

```ts
getDropTargets(_container, children, dragged) {
  const garden = getGarden();
  const c = findContainer(garden, containerId);
  if (!c || !c.layout) return [];

  const bounds = getPlantableBounds(c);
  const occupied = new Set(
    children.filter((ch) => ch.id !== dragged.id).map((ch) => `${ch.pose.x},${ch.pose.y}`),
  );

  let pts: { x: number; y: number }[];
  if (c.layout.type === 'grid') {
    pts = getGridCells(c.layout.cellSizeFt, bounds);
  } else {
    pts = getSlots(c.layout, bounds);
  }

  return pts
    .filter((p) => !occupied.has(`${p.x},${p.y}`))
    .map((p) => ({ pose: { x: p.x, y: p.y }, origin: { x: p.x, y: p.y } }));
},
```

- [ ] **Step 5: Use gridSnapStrategy for grid containers**

Replace the `snap` setup before the return statement:

```ts
const layout = probe.layout;
const snap: LayoutSnap<PlantingPose> = layout?.type === 'grid'
  ? {
      pickTarget(targets, pointer) {
        // Round to nearest cell center
        const strategy = gridSnapStrategy<PlantingPose>(layout.cellSizeFt);
        const snapped = strategy.snap?.(pointer) ?? pointer;
        return (
          targets.reduce<{ t: DropTarget<PlantingPose>; d: number } | null>((best, t) => {
            const dx = t.origin.x - snapped.x;
            const dy = t.origin.y - snapped.y;
            const d = dx * dx + dy * dy;
            return !best || d < best.d ? { t, d } : best;
          }, null)?.t ?? null
        );
      },
    }
  : nearestSlotSnap();
```

Note: `gridSnapStrategy` from weasel returns a `SnapStrategy`, not a `LayoutSnap`. Its interface may differ — check `@orochi235/weasel`'s `SnapStrategy` type. If the `strategy.snap` approach above doesn't compile, fall back to `nearestSlotSnap()` for grid containers as well (the cell center drop targets already constrain snapping adequately).

- [ ] **Step 6: Commit**

```bash
git add src/canvas/adapters/plantingLayout.ts
git commit -m "refactor: plantingLayout uses Layout model"
```

---

## Task 6: Update findSnapContainer.ts

**Files:**
- Modify: `src/canvas/findSnapContainer.ts`

- [ ] **Step 1: Update imports**

```ts
// Remove:
import { computeSlots } from '../model/arrangement';

// Add:
import { getSlots, getGridCells } from '../model/layout';
```

- [ ] **Step 2: Update inline type annotations**

Find all occurrences of `arrangement: import('../model/arrangement').Arrangement | null` (lines ~60, ~151) and replace with:
```ts
layout: import('../model/layout').Layout | null
```

- [ ] **Step 3: Update the snap logic function (~line 151)**

In the function that probes containers for snap slots, replace:

```ts
// Remove:
const arrangement = container.arrangement;
if (!arrangement) return null;
if (arrangement.type === 'free') {
  // Free arrangement always has room — slot at container center
  ...
}
const slots = computeSlots(arrangement, bounds);

// Add:
const layout = container.layout;
if (!layout) {
  // No layout — slot at container center
  const cx = container.x + container.width / 2;
  const cy = container.y + container.length / 2;
  return { x: cx, y: cy, containerId: container.id };
}
const slots = layout.type === 'grid'
  ? getGridCells(layout.cellSizeFt, bounds)
  : getSlots(layout, bounds);
```

- [ ] **Step 4: Update structure/zone mapping (~lines 82, 103)**

Find where structures and zones are mapped into container objects. Change `arrangement: s.arrangement` to `layout: s.layout` and `arrangement: z.arrangement` to `layout: z.layout`.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/findSnapContainer.ts
git commit -m "refactor: findSnapContainer uses Layout model"
```

---

## Task 7: Update plantingLayersWorld.ts

**Files:**
- Modify: `src/canvas/layers/plantingLayersWorld.ts`

- [ ] **Step 1: Update imports**

```ts
// Remove:
import { computeContainerOverlay } from '../../model/containerOverlay';
// (and any arrangement.ts import)

// Add if not already present:
import { computeContainerOverlay } from '../../model/containerOverlay';
```

- [ ] **Step 2: Update inline type annotation (line ~36)**

```ts
// Remove:
  arrangement: import('../../model/arrangement').Arrangement | null;

// Add:
  layout: import('../../model/layout').Layout | null;
```

- [ ] **Step 3: Update isSingleFill checks (lines ~95, ~184, ~256)**

```ts
// Remove:
const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;

// Add:
const isSingleFill = parent.layout?.type === 'single' && childCount.get(p.parentId) === 1;
```

- [ ] **Step 4: Update overlay call (line ~135–138)**

```ts
// Remove:
if (!parent.arrangement || parent.arrangement.type === 'free') continue;
...
const overlay = computeContainerOverlay(parent.arrangement, bounds, { occupiedSlots: occSet });

// Add:
if (!parent.layout) continue;
...
const overlay = computeContainerOverlay(parent.layout, bounds, { occupiedSlots: occSet });
```

- [ ] **Step 5: Commit**

```bash
git add src/canvas/layers/plantingLayersWorld.ts
git commit -m "refactor: plantingLayersWorld uses Layout model"
```

---

## Task 8: Simplify containerOverlay.ts

**Files:**
- Modify: `src/model/containerOverlay.ts`

- [ ] **Step 1: Update imports**

```ts
// Remove:
import { computeSlots, type Arrangement, type ParentBounds, type Slot } from './arrangement';

// Add:
import { getSlots, getGridCells, type Layout, type ParentBounds } from './layout';
```

- [ ] **Step 2: Rewrite computeContainerOverlay**

Replace the entire function:

```ts
export function computeContainerOverlay(
  layout: Layout | null,
  bounds: ParentBounds,
  ctx: OverlayContext,
): ContainerOverlay {
  if (!layout || layout.type === 'grid') {
    // Grid overlay is owned by the weasel grid layer; nothing to add here.
    return { items: [] };
  }

  const slots = getSlots(layout, bounds);
  const items: OverlayPrimitive[] = slots.map((s) => {
    const relKey = `${s.x - bounds.x},${s.y - bounds.y}`;
    return { type: 'slot-dot', x: s.x, y: s.y, occupied: ctx.occupiedSlots.has(relKey) };
  });

  return { items };
}
```

- [ ] **Step 3: Rewrite computeDragOverlay**

Replace the entire function:

```ts
export function computeDragOverlay(
  layout: Layout | null,
  bounds: ParentBounds,
  ctx: DragOverlayContext,
): ContainerOverlay {
  if (!layout || layout.type === 'grid') {
    return { items: [] };
  }

  const slots = getSlots(layout, bounds);
  const target = nearestUnoccupied(slots, ctx.cursorX, ctx.cursorY, ctx.occupiedSlots, bounds);
  if (!target) return { items: [] };

  return {
    items: [{ type: 'highlight-slot', x: target.x, y: target.y, radiusFt: ctx.radiusFt }],
  };
}
```

- [ ] **Step 4: Update nearestUnoccupied signature**

```ts
function nearestUnoccupied(
  slots: { x: number; y: number }[],   // was Slot[]
  cx: number,
  cy: number,
  occupied: Set<string>,
  bounds: ParentBounds,
): { x: number; y: number } | null {
```

Also remove the `GridLine` type and its generation from the file — it's no longer produced.

- [ ] **Step 5: Remove GridLine from the exports**

Delete the `GridLine` interface and remove it from the `OverlayPrimitive` union. Update `OverlayPrimitive`:

```ts
export type OverlayPrimitive = SlotDot | HighlightSlot;
```

- [ ] **Step 6: Commit**

```bash
git add src/model/containerOverlay.ts
git commit -m "refactor: containerOverlay uses Layout model; remove grid-line overlay"
```

---

## Task 9: Update PropertiesPanel.tsx

**Files:**
- Modify: `src/components/sidebar/PropertiesPanel.tsx`

- [ ] **Step 1: Remove arrangement imports**

```ts
// Remove:
import type { Arrangement, ArrangementType } from '../../model/arrangement';
import { defaultArrangement } from '../../model/arrangement';
import { OptimizePanel } from './OptimizePanel';

// Add:
import type { Layout, LayoutType } from '../../model/layout';
```

- [ ] **Step 2: Remove arrangement UI constants**

Delete the `ARRANGEMENT_TYPES` array and `ARRANGEMENT_LABELS` record entirely.

- [ ] **Step 3: Replace layout section in JSX**

Find the section starting at the `{/* Layout */}` label (around line 283). Replace the entire arrangement dropdown + all mode-specific param forms + the `<OptimizePanel>` at the bottom with:

```tsx
{/* Layout */}
<span className={f.label}>Layout</span>
<select
  value={obj.layout?.type ?? 'none'}
  onChange={(e) => {
    const t = e.target.value as LayoutType | 'none';
    if (t === 'none') { updateObj({ layout: null }); return; }
    const next: Layout =
      t === 'single' ? { type: 'single' }
      : t === 'grid' ? { type: 'grid', cellSizeFt: 1 }
      : { type: 'snap-points', points: [] };
    updateObj({ layout: next });
  }}
>
  <option value="none">None</option>
  <option value="single">Single</option>
  <option value="grid">Grid</option>
  <option value="snap-points">Snap Points</option>
</select>

{obj.layout?.type === 'grid' && (
  <label className={f.fieldRow}>
    <span className={f.label}>Cell size (ft)</span>
    <input
      type="number"
      min={0.25}
      step={0.25}
      value={obj.layout.cellSizeFt}
      onChange={(e) => {
        const v = parseFloat(e.target.value) || 1;
        updateObj({ layout: { type: 'grid', cellSizeFt: v } });
      }}
    />
  </label>
)}
```

Note: `updateObj` calls either `commitStructureUpdate` or `commitZoneUpdate` — check the existing code to confirm the correct call pattern and CSS class names (`f.fieldRow`, `f.label`).

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar/PropertiesPanel.tsx
git commit -m "refactor: PropertiesPanel uses Layout model; remove arrangement/optimizer UI"
```

---

## Task 10: Delete dead code

- [ ] **Step 1: Delete arrangement model and strategies**

```bash
rm /Users/mike/src/eric/src/model/arrangement.ts
rm -rf /Users/mike/src/eric/src/model/arrangementStrategies/
rm /Users/mike/src/eric/src/model/cultivarSpacing.ts
```

- [ ] **Step 2: Delete optimizer**

```bash
rm -rf /Users/mike/src/eric/src/optimizer/
rm -rf /Users/mike/src/eric/src/components/optimizer/
rm /Users/mike/src/eric/src/components/sidebar/OptimizePanel.tsx
```

- [ ] **Step 3: Delete old specs**

```bash
rm /Users/mike/src/eric/docs/superpowers/specs/2026-05-04-raised-bed-layout-strategies-design.md
rm /Users/mike/src/eric/docs/superpowers/specs/2026-05-05-optimizer-auto-clustering-design.md
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete arrangement model, strategies, optimizer, and related UI"
```

---

## Task 11: Build verification

- [ ] **Step 1: Run full build**

```bash
cd /Users/mike/src/eric && npm run build
```

Expected: zero TypeScript errors, zero import errors.

- [ ] **Step 2: Run tests**

```bash
cd /Users/mike/src/eric && npm test
```

Expected: all tests pass. Any remaining arrangement/optimizer tests should be gone.

- [ ] **Step 3: Fix any remaining type errors**

Common issues to look for:
- Any file still importing from `./arrangement` or `../model/arrangement`
- `trellisEdge` references (should be removed from Structure)
- `applyOptimizerResult` references in tests or other store consumers

Run:
```bash
grep -r "from.*arrangement" /Users/mike/src/eric/src --include="*.ts" --include="*.tsx"
grep -r "applyOptimizerResult\|OptimizePanel\|OptimizerWizard" /Users/mike/src/eric/src --include="*.ts" --include="*.tsx"
```

Fix any found references.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve remaining layout migration type errors"
```
