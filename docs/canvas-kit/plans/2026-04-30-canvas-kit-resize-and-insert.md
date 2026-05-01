# canvas-kit Resize + Insert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `useResizeInteraction` and `usePlotInteraction` from `src/canvas/hooks/` into the canvas-kit framework as `useResizeInteraction` and `useInsertInteraction`, sibling hooks to Phase 1's `useMoveInteraction`.

**Architecture:** Generalize `MoveBehavior<TPose>` into `GestureBehavior<TPose, TProposed>` so resize and insert can reuse the lifecycle/context plumbing with hook-specific proposed-pose shapes. Reorganize `interactions/behaviors/` into per-hook subpaths (`move/`, `resize/`, `insert/`, `shared/`) so three `snapToGrid` factories can coexist. Both new hooks emit ops via the existing adapter `applyBatch` pipeline; resize emits `[TransformOp]`, insert emits `[CreateOp]`.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, vi.useFakeTimers (for any dwell-style behaviors — none in this phase).

**Reference spec:** `docs/superpowers/specs/2026-04-30-canvas-kit-resize-insert-design.md`.
**Predecessor plan:** `docs/superpowers/plans/2026-04-30-canvas-kit-foundation-and-move.md` (Phase 1: foundation + move).

**Out of scope (Phase 3+):** Area-select / clipboard ports, drag-lab adoption, aspect-ratio lock, rotation, multi-object resize, alignment guides, gardenStore migration to `createHistory`.

---

## File Structure

### New files (kit)

```
src/canvas-kit/interactions/move/move.ts                        # moved from interactions/move.ts
src/canvas-kit/interactions/move/move.test.ts                   # moved
src/canvas-kit/interactions/move/behaviors/snapToGrid.ts        # moved
src/canvas-kit/interactions/move/behaviors/snapToGrid.test.ts   # moved
src/canvas-kit/interactions/move/behaviors/snapToContainer.ts   # moved
src/canvas-kit/interactions/move/behaviors/snapToContainer.test.ts # moved
src/canvas-kit/interactions/move/behaviors/snapBackOrDelete.ts  # moved
src/canvas-kit/interactions/move/behaviors/snapBackOrDelete.test.ts # moved
src/canvas-kit/interactions/move/behaviors/index.ts             # moved
src/canvas-kit/interactions/move/index.ts                       # NEW barrel

src/canvas-kit/interactions/shared/snap.ts                      # moved from behaviors/snap.ts
src/canvas-kit/interactions/shared/snap.test.ts                 # moved
src/canvas-kit/interactions/shared/strategies/grid.ts           # moved from behaviors/strategies/grid.ts
src/canvas-kit/interactions/shared/strategies/index.ts          # NEW barrel
src/canvas-kit/interactions/shared/index.ts                     # NEW barrel

src/canvas-kit/interactions/resize/resize.ts                    # NEW useResizeInteraction
src/canvas-kit/interactions/resize/resize.test.ts               # NEW
src/canvas-kit/interactions/resize/behaviors/snapToGrid.ts      # NEW
src/canvas-kit/interactions/resize/behaviors/snapToGrid.test.ts # NEW
src/canvas-kit/interactions/resize/behaviors/clampMinSize.ts    # NEW
src/canvas-kit/interactions/resize/behaviors/clampMinSize.test.ts # NEW
src/canvas-kit/interactions/resize/behaviors/index.ts           # NEW barrel
src/canvas-kit/interactions/resize/index.ts                     # NEW barrel

src/canvas-kit/interactions/insert/insert.ts                    # NEW useInsertInteraction
src/canvas-kit/interactions/insert/insert.test.ts               # NEW
src/canvas-kit/interactions/insert/behaviors/snapToGrid.ts      # NEW
src/canvas-kit/interactions/insert/behaviors/snapToGrid.test.ts # NEW
src/canvas-kit/interactions/insert/behaviors/index.ts           # NEW barrel
src/canvas-kit/interactions/insert/index.ts                     # NEW barrel
```

### New files (app-side adapters)

```
src/canvas/adapters/zoneResize.ts                # createZoneResizeAdapter
src/canvas/adapters/zoneResize.test.ts
src/canvas/adapters/structureResize.ts           # createStructureResizeAdapter
src/canvas/adapters/structureResize.test.ts
src/canvas/adapters/insert.ts                    # createInsertAdapter
src/canvas/adapters/insert.test.ts
```

### Modified files

```
src/canvas-kit/interactions/types.ts             # generalize behaviors; add Resize/Insert types
src/canvas-kit/adapters/types.ts                 # add ResizeAdapter, InsertAdapter
src/canvas-kit/index.ts                          # add hook exports + types; drop top-level snapToGrid
src/canvas/CanvasStack.tsx                       # wire kit useResizeInteraction + useInsertInteraction
src/canvas/CanvasRenderer.tsx OR equivalent      # resize lerp + insert dashed preview from overlays
src/store/uiStore.ts                             # add resizeOverlay + insertOverlay state
docs/superpowers/specs/2026-04-30-canvas-kit-resize-insert-design.md # status flip
```

### Deleted files (after Task 12)

```
src/canvas/hooks/useResizeInteraction.ts
src/canvas/hooks/usePlotInteraction.ts
(any associated tests — verified via grep before delete)
```

---

## Conventions for tasks

- All commits use Conventional Commits (`feat`, `refactor`, `test`, `docs`).
- TDD: failing test → run failing → implementation → run passing → commit. Per task, multiple commits are allowed and encouraged when the task is sprawling.
- Targeted runs: `npm test -- --run path/to/test.test.ts`. Full suite: `npm test -- --run`. Build: `npm run build` (only at end of plan, Task 13).
- Phase 1 tests at `src/canvas-kit/interactions/move/**` and adapter tests must keep passing throughout.

---

### Task 0: Kit unit-free rename

Rename in canvas-kit only, leaving garden domain code (`gridCellSizeFt`, store) untouched. The seam is at the kit boundary: garden passes its `gridCellSizeFt` value to a kit-side argument named `cell`.

**Files:**
- Modify: `src/canvas-kit/interactions/behaviors/snapToGrid.ts`
- Modify: `src/canvas-kit/interactions/behaviors/snapToGrid.test.ts`
- Modify: `src/canvas-kit/interactions/behaviors/strategies/grid.ts`
- Modify: `src/canvas-kit/interactions/behaviors/snapBackOrDelete.ts`
- Modify: `src/canvas-kit/interactions/behaviors/snapBackOrDelete.test.ts`
- Modify: `src/canvas/CanvasStack.tsx` (consumer)

- [ ] **Step 0.1: Update `gridSnapStrategy(cellFt)` → `gridSnapStrategy(cell)`**

`src/canvas-kit/interactions/behaviors/strategies/grid.ts`:

```ts
import type { SnapStrategy } from '../../types';

export function gridSnapStrategy<TPose extends { x: number; y: number }>(
  cell: number,
): SnapStrategy<TPose> {
  return {
    snap(pose) {
      return {
        ...pose,
        x: Math.round(pose.x / cell) * cell,
        y: Math.round(pose.y / cell) * cell,
      };
    },
  };
}
```

- [ ] **Step 0.2: Update `snapToGrid({ cell })` factory**

`src/canvas-kit/interactions/behaviors/snapToGrid.ts`:

```ts
import type { ModifierState, MoveBehavior } from '../types';
import { snap } from './snap';
import { gridSnapStrategy } from './strategies/grid';

type ModKey = keyof ModifierState;

export function snapToGrid<TPose extends { x: number; y: number }>(args: {
  cell: number;
  bypassKey?: ModKey;
}): MoveBehavior<TPose> {
  return snap(gridSnapStrategy<TPose>(args.cell), { bypassKey: args.bypassKey });
}
```

- [ ] **Step 0.3: Update `snapBackOrDelete({ radius })`**

`src/canvas-kit/interactions/behaviors/snapBackOrDelete.ts`:

```ts
import { createDeleteOp } from '../../ops/delete';
import type { Op } from '../../ops/types';
import type { MoveBehavior } from '../types';

export function snapBackOrDelete<TPose extends { x: number; y: number }>(args: {
  radius: number;
  onFreeRelease: 'snap-back' | 'delete';
  deleteLabel?: string;
}): MoveBehavior<TPose> {
  const { radius, onFreeRelease, deleteLabel = 'Delete' } = args;
  const r2 = radius * radius;

  return {
    onStart(ctx) {
      const snapshots = new Map<string, { id: string }>();
      for (const id of ctx.draggedIds) {
        const obj = ctx.adapter.getObject(id) ?? { id };
        snapshots.set(id, obj);
      }
      ctx.scratch['snapBackOrDelete.snapshots'] = snapshots;
    },
    onEnd(ctx) {
      if (ctx.snap) return;
      const id = ctx.draggedIds[0];
      const origin = ctx.origin.get(id)!;
      const current = ctx.current.get(id)!;
      const dx = current.x - origin.x;
      const dy = current.y - origin.y;
      const within = dx * dx + dy * dy <= r2;
      if (within) return null;
      if (onFreeRelease === 'delete') {
        const snapshots = ctx.scratch['snapBackOrDelete.snapshots'] as
          | Map<string, { id: string }>
          | undefined;
        const obj = snapshots?.get(id) ?? { id };
        const ops: Op[] = [createDeleteOp({ object: obj, label: deleteLabel })];
        return ops;
      }
      return;
    },
  };
}
```

- [ ] **Step 0.4: Update test files — replace `cellFt:` and `radiusFt:` with `cell:` and `radius:`**

In `src/canvas-kit/interactions/behaviors/snapToGrid.test.ts`, replace all occurrences of `cellFt:` with `cell:`. In `src/canvas-kit/interactions/behaviors/snapBackOrDelete.test.ts`, replace `radiusFt:` with `radius:`.

- [ ] **Step 0.5: Update `src/canvas/CanvasStack.tsx` consumer call sites**

`src/canvas/CanvasStack.tsx:200-221` currently passes `cellFt: garden.gridCellSizeFt` and `radiusFt: garden.gridCellSizeFt`. Rename keys only — values are unchanged:

```ts
behaviors: [
  snapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' }),
  snapToContainer({ /* unchanged */ }),
  snapBackOrDelete({ radius: garden.gridCellSizeFt, onFreeRelease: 'delete' }),
],
```

Apply the same `cell:` rename in the zoneMove and structureMove behavior arrays.

- [ ] **Step 0.6: Run full suite**

```
npm test -- --run
```
Expected: PASS — pure rename, no behavior change.

- [ ] **Step 0.7: Commit**

```
git add src/canvas-kit/ src/canvas/CanvasStack.tsx
git commit -m "refactor(canvas-kit): drop Ft suffix from kit-side identifiers"
```

---

### Task 1: Generalize MoveBehavior → GestureBehavior; add Resize + Insert types

**Approach decision (documented).** Phase 1's `MoveBehavior<TPose>` already returns `{ pose?, snap? } | void`. The `snap?` field is move-specific (it represents a re-parent target). To preserve Phase 1 unchanged while letting Resize and Insert define their own onMove return shapes, we use **a base `GestureBehavior<TPose, TProposed, TMoveResult>` interface and define hook-specific aliases that pin TMoveResult**:

```ts
type MoveBehavior<TPose>   = GestureBehavior<TPose, TPose, BehaviorMoveResult<TPose>>;
type ResizeBehavior<TPose> = GestureBehavior<TPose, ResizeProposed<TPose>, ResizeMoveResult<TPose>>;
type InsertBehavior<TPose> = GestureBehavior<TPose, InsertProposed<TPose>, InsertMoveResult<TPose>>;
```

This keeps the existing `MoveBehavior` shape literally unchanged at the call site (the alias's resolved type matches today's interface), so all Phase 1 behaviors and tests compile without modification.

**Files:**
- Modify: `src/canvas-kit/interactions/types.ts`
- Modify: `src/canvas-kit/adapters/types.ts`
- Create: `src/canvas-kit/interactions/types.test.ts` (compile-time shape probes)

- [ ] **Step 1.1: Write failing compile-time-shape tests**

`src/canvas-kit/interactions/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type {
  ResizeBehavior,
  InsertBehavior,
  ResizeAnchor,
  ResizePose,
  ResizeOverlay,
  InsertOverlay,
} from './types';

describe('Phase 2 type shapes', () => {
  it('ResizeBehavior.onMove receives proposed.pose and proposed.anchor', () => {
    const b: ResizeBehavior<ResizePose> = {
      onMove(_ctx, proposed) {
        // Compile probe: these field accesses must type-check.
        const _x: number = proposed.pose.x;
        const _ax: ResizeAnchor['x'] = proposed.anchor.x;
        void _x; void _ax;
        return { pose: proposed.pose };
      },
    };
    expect(typeof b.onMove).toBe('function');
  });

  it('InsertBehavior.onMove receives proposed.start and proposed.current', () => {
    interface P { x: number; y: number }
    const b: InsertBehavior<P> = {
      onMove(_ctx, proposed) {
        const _sx: number = proposed.start.x;
        const _cx: number = proposed.current.x;
        void _sx; void _cx;
        return { current: proposed.current };
      },
    };
    expect(typeof b.onMove).toBe('function');
  });

  it('ResizeOverlay carries currentPose, targetPose, anchor', () => {
    const o: ResizeOverlay<ResizePose> = {
      id: 'a',
      currentPose: { x: 0, y: 0, width: 1, height: 1 },
      targetPose: { x: 0, y: 0, width: 1, height: 1 },
      anchor: { x: 'min', y: 'free' },
    };
    expect(o.id).toBe('a');
  });

  it('InsertOverlay carries start and current', () => {
    interface P { x: number; y: number }
    const o: InsertOverlay<P> = { start: { x: 0, y: 0 }, current: { x: 1, y: 1 } };
    expect(o.current.x).toBe(1);
  });
});
```

- [ ] **Step 1.2: Run targeted test — fail (types not yet defined)**

```
npm test -- --run src/canvas-kit/interactions/types.test.ts
```
Expected: FAIL — type imports don't resolve.

- [ ] **Step 1.3: Replace contents of `src/canvas-kit/interactions/types.ts`**

```ts
import type { Op } from '../ops/types';
import type { MoveAdapter, SnapTarget } from '../adapters/types';

export interface ModifierState {
  alt: boolean;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

export interface PointerState {
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
}

/**
 * Per-gesture context passed to behaviors. `current` is the running pose
 * map; behaviors mutate proposed poses by returning new TPose values from
 * onMove. `scratch` is per-gesture key/value storage that resets at the
 * next gesture start.
 */
export interface GestureContext<TPose, TObject extends { id: string } = { id: string }> {
  draggedIds: string[];
  origin: Map<string, TPose>;
  current: Map<string, TPose>;
  snap: SnapTarget<TPose> | null;
  modifiers: ModifierState;
  pointer: PointerState;
  adapter: MoveAdapter<TObject, TPose>;
  /**
   * Per-gesture mutable store. Keys should be namespaced by behavior name to avoid
   * collisions: `'behaviorName'` for a single value, `'behaviorName.field'` for
   * sub-keys. Two behaviors sharing a key will silently clobber each other.
   */
  scratch: Record<string, unknown>;
}

export interface SnapStrategy<TPose> {
  snap(pose: TPose, ctx: GestureContext<TPose, { id: string }>): TPose | null;
}

/**
 * Generalized base behavior. Each hook defines an alias that pins the
 * proposed-pose shape (TProposed) and the onMove return shape (TMoveResult).
 * onEnd is uniform: first non-undefined return wins (Op[] = commit those,
 * null = abort, undefined = defer).
 */
export interface GestureBehavior<TPose, TProposed, TMoveResult> {
  onStart?(ctx: GestureContext<TPose>): void;
  onMove?(ctx: GestureContext<TPose>, proposed: TProposed): TMoveResult | void;
  onEnd?(ctx: GestureContext<TPose>): Op[] | null | void;
}

// ----- move -----

export interface BehaviorMoveResult<TPose> {
  pose?: TPose;
  snap?: SnapTarget<TPose> | null;
}

export type MoveBehavior<TPose> = GestureBehavior<TPose, TPose, BehaviorMoveResult<TPose>>;

export interface MoveOverlay<TPose> {
  draggedIds: string[];
  poses: Map<string, TPose>;
  snapped: SnapTarget<TPose> | null;
  hideIds: string[];
}

// ----- resize -----

export type ResizeAnchor = {
  x: 'min' | 'max' | 'free';
  y: 'min' | 'max' | 'free';
};

export interface ResizePose {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeProposed<TPose extends ResizePose> {
  pose: TPose;
  anchor: ResizeAnchor;
}

export interface ResizeMoveResult<TPose extends ResizePose> {
  pose?: TPose;
}

export type ResizeBehavior<TPose extends ResizePose> = GestureBehavior<
  TPose,
  ResizeProposed<TPose>,
  ResizeMoveResult<TPose>
>;

export interface ResizeOverlay<TPose extends ResizePose> {
  id: string;
  currentPose: TPose;
  targetPose: TPose;
  anchor: ResizeAnchor;
}

// ----- insert -----

export interface InsertProposed<TPose extends { x: number; y: number }> {
  start: TPose;
  current: TPose;
}

export interface InsertMoveResult<TPose extends { x: number; y: number }> {
  start?: TPose;
  current?: TPose;
}

export type InsertBehavior<TPose extends { x: number; y: number }> = GestureBehavior<
  TPose,
  InsertProposed<TPose>,
  InsertMoveResult<TPose>
>;

export interface InsertOverlay<TPose extends { x: number; y: number }> {
  start: TPose;
  current: TPose;
}
```

- [ ] **Step 1.4: Add ResizeAdapter and InsertAdapter to `src/canvas-kit/adapters/types.ts`**

Append to the existing file:

```ts
import type { ResizePose } from '../interactions/types';

/**
 * Narrow adapter for `useResizeInteraction`. Mirrors `MoveAdapter`'s shape
 * minus reparenting and snap-target lookup.
 */
export interface ResizeAdapter<TObject extends { id: string }, TPose extends ResizePose> {
  getObject(id: string): TObject | undefined;
  getPose(id: string): TPose;
  setPose(id: string, pose: TPose): void;
  applyBatch(ops: Op[], label: string): void;
}

/**
 * Narrow adapter for `useInsertInteraction`. The kit knows nothing about
 * what tool is active or what shape to construct; it asks the adapter to
 * produce an object given the gesture bounds. Returning `null` aborts.
 */
export interface InsertAdapter<TObject extends { id: string }> {
  commitInsert(bounds: { x: number; y: number; width: number; height: number }): TObject | null;
  applyBatch(ops: Op[], label: string): void;
}
```

(Note: `ResizeAdapter` imports `ResizePose` from `../interactions/types`. If a circular import surfaces during build, inline the structural shape `{ x: number; y: number; width: number; height: number }` instead.)

- [ ] **Step 1.5: Run targeted test — pass; run full suite — verify Phase 1 unchanged**

```
npm test -- --run src/canvas-kit/interactions/types.test.ts
npm test -- --run
```
Expected: PASS for both. The `MoveBehavior` alias resolves to the same shape Phase 1 expected, so every existing test stays green.

- [ ] **Step 1.6: Commit**

```
git add src/canvas-kit/interactions/types.ts src/canvas-kit/interactions/types.test.ts src/canvas-kit/adapters/types.ts
git commit -m "feat(canvas-kit): generalize MoveBehavior into GestureBehavior; add Resize/Insert types"
```

---

### Task 2: File reorg — split behaviors into per-hook subpaths

Pure structural refactor. Move files; update imports. No behavior changes.

**Files:**
- Move + rename across `src/canvas-kit/interactions/`.
- Modify: `src/canvas-kit/index.ts` (top-level barrel).
- Modify: `src/canvas/CanvasStack.tsx` (consumer import path).

- [ ] **Step 2.1: Move move-specific files into `interactions/move/`**

```
git mv src/canvas-kit/interactions/move.ts                          src/canvas-kit/interactions/move/move.ts
git mv src/canvas-kit/interactions/move.test.ts                     src/canvas-kit/interactions/move/move.test.ts
git mv src/canvas-kit/interactions/behaviors/snapToGrid.ts          src/canvas-kit/interactions/move/behaviors/snapToGrid.ts
git mv src/canvas-kit/interactions/behaviors/snapToGrid.test.ts     src/canvas-kit/interactions/move/behaviors/snapToGrid.test.ts
git mv src/canvas-kit/interactions/behaviors/snapToContainer.ts     src/canvas-kit/interactions/move/behaviors/snapToContainer.ts
git mv src/canvas-kit/interactions/behaviors/snapToContainer.test.ts src/canvas-kit/interactions/move/behaviors/snapToContainer.test.ts
git mv src/canvas-kit/interactions/behaviors/snapBackOrDelete.ts    src/canvas-kit/interactions/move/behaviors/snapBackOrDelete.ts
git mv src/canvas-kit/interactions/behaviors/snapBackOrDelete.test.ts src/canvas-kit/interactions/move/behaviors/snapBackOrDelete.test.ts
git mv src/canvas-kit/interactions/behaviors/index.ts               src/canvas-kit/interactions/move/behaviors/index.ts
```

- [ ] **Step 2.2: Move shared snap infrastructure into `interactions/shared/`**

```
git mv src/canvas-kit/interactions/behaviors/snap.ts                src/canvas-kit/interactions/shared/snap.ts
git mv src/canvas-kit/interactions/behaviors/snap.test.ts           src/canvas-kit/interactions/shared/snap.test.ts
git mv src/canvas-kit/interactions/behaviors/strategies/grid.ts     src/canvas-kit/interactions/shared/strategies/grid.ts
```

(There may not be a `snap.test.ts`; if not, skip that line. Verify with `ls src/canvas-kit/interactions/behaviors/` first.)

- [ ] **Step 2.3: Delete the now-empty `behaviors/` and `behaviors/strategies/` directories**

```
rmdir src/canvas-kit/interactions/behaviors/strategies
rmdir src/canvas-kit/interactions/behaviors
```

- [ ] **Step 2.4: Fix imports inside moved files**

For `src/canvas-kit/interactions/move/move.ts`: change relative imports of `../ops/...` and `../adapters/...` to `../../ops/...` and `../../adapters/...`. Change `./types` to `../types`.

For `src/canvas-kit/interactions/move/behaviors/snapToGrid.ts`:
```ts
import type { ModifierState, MoveBehavior } from '../../types';
import { snap } from '../../shared/snap';
import { gridSnapStrategy } from '../../shared/strategies/grid';
```

For `src/canvas-kit/interactions/move/behaviors/snapToContainer.ts`: change `'../../ops/...'` and `'../types'` to `'../../../ops/...'` and `'../../types'`.

For `src/canvas-kit/interactions/move/behaviors/snapBackOrDelete.ts`: same depth adjustment as snapToContainer.

For `src/canvas-kit/interactions/shared/snap.ts`:
```ts
import type { MoveBehavior, ModifierState, SnapStrategy } from '../types';
```

For `src/canvas-kit/interactions/shared/strategies/grid.ts`:
```ts
import type { SnapStrategy } from '../../types';
```

For test files: same import path adjustments as their non-test siblings.

- [ ] **Step 2.5: Create new barrels**

`src/canvas-kit/interactions/move/behaviors/index.ts` — keep contents from the old `behaviors/index.ts` but verify it now references local `./snapToGrid`, `./snapToContainer`, `./snapBackOrDelete`. (After the move it likely already does — confirm.)

`src/canvas-kit/interactions/move/index.ts` (NEW):

```ts
export { useMoveInteraction } from './move';
export type {
  UseMoveInteractionOptions,
  UseMoveInteractionReturn,
  MoveStartArgs,
  MoveMoveArgs,
} from './move';
export { snapToGrid, snapToContainer, snapBackOrDelete } from './behaviors';
```

`src/canvas-kit/interactions/shared/strategies/index.ts` (NEW):

```ts
export { gridSnapStrategy } from './grid';
```

`src/canvas-kit/interactions/shared/index.ts` (NEW):

```ts
export { snap } from './snap';
export * from './strategies';
```

- [ ] **Step 2.6: Update top-level kit barrel `src/canvas-kit/index.ts`**

Replace the current move-behavior export block with subpath-aware exports. Drop the top-level `snapToGrid` re-export (consumers import from `@/canvas-kit/move`):

```ts
// previous lines unchanged through ops/history/adapters/interactions types

export * from './interactions/types';
export { snap, gridSnapStrategy } from './interactions/shared';
export { useMoveInteraction } from './interactions/move';
export type {
  UseMoveInteractionOptions,
  UseMoveInteractionReturn,
  MoveStartArgs,
  MoveMoveArgs,
} from './interactions/move';
// snapToGrid / snapToContainer / snapBackOrDelete are NOT re-exported at top level —
// import from '@/canvas-kit/move' to disambiguate from resize/insert siblings.
```

Add a JSDoc note at the top of `src/canvas-kit/index.ts` describing the per-hook subpath convention:

```ts
/**
 * Per-hook subpath imports: `snapToGrid` exists for move, resize, and insert
 * with different return shapes. Import from the hook-specific subpath:
 *   import { snapToGrid } from '@/canvas-kit/move';
 *   import { snapToGrid, clampMinSize } from '@/canvas-kit/resize';
 *   import { snapToGrid } from '@/canvas-kit/insert';
 */
```

- [ ] **Step 2.7: Update `src/canvas/CanvasStack.tsx` import**

Lines 23-28 currently import from `@/canvas-kit`. Change `snapToGrid`, `snapToContainer`, `snapBackOrDelete` to come from the move subpath:

```ts
import { useMoveInteraction as useKitMoveInteraction } from '@/canvas-kit';
import { snapToGrid, snapToContainer, snapBackOrDelete } from '@/canvas-kit/move';
```

- [ ] **Step 2.8: Configure path resolution for `@/canvas-kit/move` if not already**

Verify that `@/canvas-kit/move` resolves to `src/canvas-kit/interactions/move/index.ts`. If `@/canvas-kit` maps to `src/canvas-kit/index.ts` only and subpaths don't auto-resolve to `interactions/`, two options:
1. Re-export the move barrel from a top-level proxy at `src/canvas-kit/move.ts`:
   ```ts
   export * from './interactions/move';
   ```
2. Update tsconfig path alias if needed.

Pick (1) — a single one-line proxy file is the simplest. Repeat for resize and insert in their respective tasks (we'll create `src/canvas-kit/resize.ts` and `src/canvas-kit/insert.ts` proxy files later).

Create `src/canvas-kit/move.ts`:

```ts
export * from './interactions/move';
```

- [ ] **Step 2.9: Run full suite**

```
npm test -- --run
```
Expected: PASS — no behavior change, just paths.

- [ ] **Step 2.10: Commit**

```
git add -A src/canvas-kit/ src/canvas/CanvasStack.tsx
git commit -m "refactor(canvas-kit): reorganize interactions into per-hook subpaths"
```

---

### Task 3: resize/clampMinSize behavior

Anchor-aware non-bypassable minimum-size clamp. When dragging an x-axis edge would push width below `minWidth`, the dragged edge stops at `anchor + minWidth` (or `anchor - minWidth` for a max-anchor); the anchor edge stays at its original x-line. Same logic for y.

**Files:**
- Create: `src/canvas-kit/interactions/resize/behaviors/clampMinSize.test.ts`
- Create: `src/canvas-kit/interactions/resize/behaviors/clampMinSize.ts`

- [ ] **Step 3.1: Write failing tests covering all 8 anchor combinations**

`src/canvas-kit/interactions/resize/behaviors/clampMinSize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clampMinSize } from './clampMinSize';
import type {
  GestureContext,
  ResizeAnchor,
  ResizePose,
  ResizeProposed,
} from '../../types';

interface P extends ResizePose {}

function ctx(): GestureContext<P> {
  return {
    draggedIds: ['a'],
    origin: new Map([['a', { x: 0, y: 0, width: 10, height: 10 }]]),
    current: new Map(),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false },
    pointer: { worldX: 0, worldY: 0, clientX: 0, clientY: 0 },
    adapter: {} as never,
    scratch: {},
  };
}

function proposed(pose: P, anchor: ResizeAnchor): ResizeProposed<P> {
  return { pose, anchor };
}

describe('clampMinSize', () => {
  const b = clampMinSize<P>({ minWidth: 1, minHeight: 1 });

  it('east edge drag: width below min stops dragged edge; x stays at anchor', () => {
    // anchor x = 'min' means the west edge is the anchor; east edge moves.
    const r = b.onMove!(ctx(), proposed({ x: 0, y: 0, width: 0.5, height: 5 }, { x: 'min', y: 'free' }));
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 1, height: 5 } });
  });

  it('west edge drag: width below min freezes anchor (max edge); shifts x to anchor - min', () => {
    // anchor x = 'max' means east edge is anchor (originally at x+width = 0+10 = 10).
    // Dragging west toward x=9.5 yields width 0.5; clamp stops dragged west edge at x=9, width=1.
    const r = b.onMove!(ctx(), proposed({ x: 9.5, y: 0, width: 0.5, height: 5 }, { x: 'max', y: 'free' }));
    expect(r).toEqual({ pose: { x: 9, y: 0, width: 1, height: 5 } });
  });

  it('south edge drag: height below min stops dragged edge', () => {
    const r = b.onMove!(ctx(), proposed({ x: 0, y: 0, width: 5, height: 0.4 }, { x: 'free', y: 'min' }));
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 5, height: 1 } });
  });

  it('north edge drag: height below min freezes anchor (south); shifts y', () => {
    const r = b.onMove!(ctx(), proposed({ x: 0, y: 9.5, width: 5, height: 0.5 }, { x: 'free', y: 'max' }));
    expect(r).toEqual({ pose: { x: 0, y: 9, width: 5, height: 1 } });
  });

  it('corner drag (nw): both axes clamp independently', () => {
    const r = b.onMove!(ctx(), proposed({ x: 9.5, y: 9.5, width: 0.5, height: 0.5 }, { x: 'max', y: 'max' }));
    expect(r).toEqual({ pose: { x: 9, y: 9, width: 1, height: 1 } });
  });

  it('corner drag (se): both axes clamp at origin', () => {
    const r = b.onMove!(ctx(), proposed({ x: 0, y: 0, width: 0.4, height: 0.4 }, { x: 'min', y: 'min' }));
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 1, height: 1 } });
  });

  it('above min: passes through unchanged', () => {
    const r = b.onMove!(ctx(), proposed({ x: 1, y: 1, width: 5, height: 5 }, { x: 'min', y: 'min' }));
    expect(r).toBeUndefined();
  });

  it('free axis: never clamps that axis even when dimension is small', () => {
    // anchor.x = 'free' means x-axis isn't being dragged; resize behavior shouldn't clamp it.
    const r = b.onMove!(ctx(), proposed({ x: 0, y: 0, width: 0.1, height: 5 }, { x: 'free', y: 'free' }));
    expect(r).toBeUndefined();
  });
});
```

- [ ] **Step 3.2: Run tests — fail**

```
npm test -- --run src/canvas-kit/interactions/resize/behaviors/clampMinSize.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement `clampMinSize`**

`src/canvas-kit/interactions/resize/behaviors/clampMinSize.ts`:

```ts
import type { ResizeBehavior, ResizePose } from '../../types';

export function clampMinSize<TPose extends ResizePose>(args: {
  minWidth: number;
  minHeight: number;
}): ResizeBehavior<TPose> {
  const { minWidth, minHeight } = args;
  return {
    onMove(_ctx, { pose, anchor }) {
      let { x, y, width, height } = pose;
      let changed = false;
      if (anchor.x !== 'free' && width < minWidth) {
        if (anchor.x === 'min') {
          // West edge is anchor; east edge was dragged. Hold x; widen to min.
          width = minWidth;
        } else {
          // East edge is anchor at originalRight = x + width. Hold the right;
          // shift x left so width = minWidth.
          const right = x + width;
          x = right - minWidth;
          width = minWidth;
        }
        changed = true;
      }
      if (anchor.y !== 'free' && height < minHeight) {
        if (anchor.y === 'min') {
          height = minHeight;
        } else {
          const bottom = y + height;
          y = bottom - minHeight;
          height = minHeight;
        }
        changed = true;
      }
      if (!changed) return;
      return { pose: { ...pose, x, y, width, height } };
    },
  };
}
```

- [ ] **Step 3.4: Run tests — pass**

```
npm test -- --run src/canvas-kit/interactions/resize/behaviors/clampMinSize.test.ts
```
Expected: PASS.

- [ ] **Step 3.5: Commit**

```
git add src/canvas-kit/interactions/resize/behaviors/clampMinSize.ts src/canvas-kit/interactions/resize/behaviors/clampMinSize.test.ts
git commit -m "feat(canvas-kit): add resize/clampMinSize anchor-aware behavior"
```

---

### Task 4: resize/snapToGrid behavior

Anchor-aware grid snap with `suspendBelowDim?: boolean` (default true) and `bypassKey` modifier. When `suspendBelowDim` and the **origin** pose's dimension on an axis is `< cell`, that axis's snap is skipped (matches the legacy `subGridW = orig.width < cellSize` rule). Bypass key (e.g. `alt`) skips both axes.

**Files:**
- Create: `src/canvas-kit/interactions/resize/behaviors/snapToGrid.test.ts`
- Create: `src/canvas-kit/interactions/resize/behaviors/snapToGrid.ts`

- [ ] **Step 4.1: Write failing tests**

`src/canvas-kit/interactions/resize/behaviors/snapToGrid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { snapToGrid } from './snapToGrid';
import type {
  GestureContext,
  ResizeAnchor,
  ResizePose,
  ResizeProposed,
  ModifierState,
} from '../../types';

interface P extends ResizePose {}

function ctx(origin: P, mods: Partial<ModifierState> = {}): GestureContext<P> {
  return {
    draggedIds: ['a'],
    origin: new Map([['a', origin]]),
    current: new Map(),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false, ...mods },
    pointer: { worldX: 0, worldY: 0, clientX: 0, clientY: 0 },
    adapter: {} as never,
    scratch: {},
  };
}

function proposed(pose: P, anchor: ResizeAnchor): ResizeProposed<P> {
  return { pose, anchor };
}

describe('resize/snapToGrid', () => {
  const b = snapToGrid<P>({ cell: 1 });

  it('east anchor=min: snaps east edge by adjusting width', () => {
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 4 }),
      proposed({ x: 0, y: 0, width: 4.7, height: 4 }, { x: 'min', y: 'free' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 5, height: 4 } });
  });

  it('west anchor=max: snaps west edge by adjusting x and width', () => {
    // Original right is at x+width = 0+10 = 10; west drag to x=2.4 yields width=7.6.
    // Snap x to 2; width becomes 10-2 = 8.
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 10, height: 4 }),
      proposed({ x: 2.4, y: 0, width: 7.6, height: 4 }, { x: 'max', y: 'free' }),
    );
    expect(r).toEqual({ pose: { x: 2, y: 0, width: 8, height: 4 } });
  });

  it('south anchor: snaps south edge by adjusting height', () => {
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 4 }),
      proposed({ x: 0, y: 0, width: 4, height: 4.7 }, { x: 'free', y: 'min' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 4, height: 5 } });
  });

  it('north anchor: snaps north edge by adjusting y and height', () => {
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 10 }),
      proposed({ x: 0, y: 2.4, width: 4, height: 7.6 }, { x: 'free', y: 'max' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 2, width: 4, height: 8 } });
  });

  it('corner (se = min/min): snaps both axes', () => {
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 4 }),
      proposed({ x: 0, y: 0, width: 4.7, height: 4.7 }, { x: 'min', y: 'min' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 5, height: 5 } });
  });

  it('suspendBelowDim default true: origin.width < cell skips x-axis snap', () => {
    // origin width = 0.5 < cell = 1. East drag to width=0.7 must NOT snap.
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 0.5, height: 4 }),
      proposed({ x: 0, y: 0, width: 0.7, height: 4 }, { x: 'min', y: 'free' }),
    );
    expect(r).toBeUndefined();
  });

  it('suspendBelowDim default true: origin.height < cell skips y-axis only', () => {
    // origin height < cell, but width >= cell. East+south drag: x snaps, y doesn't.
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 0.5 }),
      proposed({ x: 0, y: 0, width: 4.7, height: 0.7 }, { x: 'min', y: 'min' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 5, height: 0.7 } });
  });

  it('suspendBelowDim=false: snaps even when origin dim < cell', () => {
    const b2 = snapToGrid<P>({ cell: 1, suspendBelowDim: false });
    const r = b2.onMove!(
      ctx({ x: 0, y: 0, width: 0.5, height: 4 }),
      proposed({ x: 0, y: 0, width: 0.7, height: 4 }, { x: 'min', y: 'free' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 1, height: 4 } });
  });

  it('bypassKey skips snap entirely', () => {
    const b2 = snapToGrid<P>({ cell: 1, bypassKey: 'alt' });
    const r = b2.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 4 }, { alt: true }),
      proposed({ x: 0, y: 0, width: 4.7, height: 4.7 }, { x: 'min', y: 'min' }),
    );
    expect(r).toBeUndefined();
  });

  it('free axis: never snapped', () => {
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 4 }),
      proposed({ x: 0, y: 0, width: 4.7, height: 4.7 }, { x: 'free', y: 'min' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 4.7, height: 5 } });
  });
});
```

- [ ] **Step 4.2: Run tests — fail**

```
npm test -- --run src/canvas-kit/interactions/resize/behaviors/snapToGrid.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement `snapToGrid` for resize**

`src/canvas-kit/interactions/resize/behaviors/snapToGrid.ts`:

```ts
import type {
  ModifierState,
  ResizeBehavior,
  ResizePose,
} from '../../types';

type ModKey = keyof ModifierState;

export function snapToGrid<TPose extends ResizePose>(args: {
  cell: number;
  bypassKey?: ModKey;
  suspendBelowDim?: boolean;
}): ResizeBehavior<TPose> {
  const { cell, bypassKey, suspendBelowDim = true } = args;
  const round = (v: number) => Math.round(v / cell) * cell;

  return {
    onMove(ctx, { pose, anchor }) {
      if (bypassKey && ctx.modifiers[bypassKey]) return;
      const origin = ctx.origin.get(ctx.draggedIds[0])!;
      const subX = suspendBelowDim && origin.width < cell;
      const subY = suspendBelowDim && origin.height < cell;

      let { x, y, width, height } = pose;
      let changed = false;

      if (anchor.x !== 'free' && !subX) {
        if (anchor.x === 'min') {
          // East edge moves; west (x) stays.
          const east = round(x + width);
          width = east - x;
        } else {
          // West edge moves; east (x+width) stays.
          const right = origin.x + origin.width;
          const newX = round(x);
          width = right - newX;
          x = newX;
        }
        changed = true;
      }
      if (anchor.y !== 'free' && !subY) {
        if (anchor.y === 'min') {
          const south = round(y + height);
          height = south - y;
        } else {
          const bottom = origin.y + origin.height;
          const newY = round(y);
          height = bottom - newY;
          y = newY;
        }
        changed = true;
      }
      if (!changed) return;
      return { pose: { ...pose, x, y, width, height } };
    },
  };
}
```

- [ ] **Step 4.4: Run tests — pass**

```
npm test -- --run src/canvas-kit/interactions/resize/behaviors/snapToGrid.test.ts
```
Expected: PASS.

- [ ] **Step 4.5: Add resize behaviors barrel + resize subpath proxy**

`src/canvas-kit/interactions/resize/behaviors/index.ts`:

```ts
export { snapToGrid } from './snapToGrid';
export { clampMinSize } from './clampMinSize';
```

`src/canvas-kit/interactions/resize/index.ts` (placeholder for now; the hook export is added in Task 5):

```ts
export * from './behaviors';
```

`src/canvas-kit/resize.ts` (top-level proxy for `@/canvas-kit/resize`):

```ts
export * from './interactions/resize';
```

- [ ] **Step 4.6: Commit**

```
git add src/canvas-kit/interactions/resize/ src/canvas-kit/resize.ts
git commit -m "feat(canvas-kit): add resize/snapToGrid anchor-aware with sub-grid suspend"
```

---

### Task 5: useResizeInteraction hook

**Lerp design decision (documented).** Phase 1's `useResizeInteraction` (legacy) computes a snapped target each move and writes a 35%-lerped pose into the store as the "current" frame. We mirror that in the kit: the hook outputs both `currentPose` and `targetPose` in the overlay; `currentPose` is the previous frame's `currentPose` lerped 35% toward this frame's `targetPose`. On the first move, `currentPose === targetPose`. The renderer simply draws `currentPose`. End commits use `targetPose` (not lerped).

This keeps the renderer simple (no per-frame RAF state) and matches user-visible behavior exactly.

Imperative API (start/move/end/cancel) — does NOT bind pointer events itself; CanvasStack dispatches.

**Files:**
- Create: `src/canvas-kit/interactions/resize/resize.test.ts`
- Create: `src/canvas-kit/interactions/resize/resize.ts`
- Modify: `src/canvas-kit/interactions/resize/index.ts`

#### Commit 5a: hook scaffolding + start/cancel

- [ ] **Step 5.1: Write initial failing tests for start/cancel**

`src/canvas-kit/interactions/resize/resize.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizeInteraction } from './resize';
import { clampMinSize } from './behaviors/clampMinSize';
import { snapToGrid } from './behaviors/snapToGrid';
import type { ResizePose, ResizeAnchor } from '../types';
import type { Op } from '../../ops/types';
import type { ResizeAdapter } from '../../adapters/types';

interface P extends ResizePose {}

function makeAdapter() {
  const state = new Map<string, P>([
    ['a', { x: 0, y: 0, width: 10, height: 10 }],
  ]);
  const batches: { ops: Op[]; label: string }[] = [];
  const adapter: ResizeAdapter<{ id: string }, P> = {
    getObject: (id) => (state.has(id) ? { id } : undefined),
    getPose: (id) => ({ ...(state.get(id)!) }),
    setPose: (id, pose) => state.set(id, { ...pose }),
    applyBatch: (ops, label) => {
      batches.push({ ops, label });
      for (const op of ops) op.apply(adapter);
    },
  };
  return { adapter, batches, state };
}

describe('useResizeInteraction — start / cancel', () => {
  it('start sets isResizing and overlay; cancel clears them with no batch', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() => useResizeInteraction<{ id: string }, P>(adapter, {}));
    expect(result.current.isResizing).toBe(false);

    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 0, 0);
    });
    expect(result.current.isResizing).toBe(true);
    expect(result.current.overlay).not.toBeNull();
    expect(result.current.overlay!.id).toBe('a');
    expect(result.current.overlay!.currentPose).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(result.current.overlay!.targetPose).toEqual({ x: 0, y: 0, width: 10, height: 10 });

    act(() => {
      result.current.cancel();
    });
    expect(result.current.isResizing).toBe(false);
    expect(result.current.overlay).toBeNull();
    expect(batches).toEqual([]);
  });
});
```

- [ ] **Step 5.2: Run failing**

```
npm test -- --run src/canvas-kit/interactions/resize/resize.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement hook scaffolding (start/cancel only first)**

`src/canvas-kit/interactions/resize/resize.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import { createTransformOp } from '../../ops/transform';
import type { Op } from '../../ops/types';
import type { ResizeAdapter } from '../../adapters/types';
import type {
  GestureContext,
  ModifierState,
  ResizeAnchor,
  ResizeBehavior,
  ResizeOverlay,
  ResizePose,
} from '../types';

const LERP = 0.35;

export interface UseResizeInteractionOptions<TPose extends ResizePose> {
  behaviors?: ResizeBehavior<TPose>[];
  resizeLabel?: string;
  onGestureStart?: (id: string) => void;
  onGestureEnd?: (committed: boolean) => void;
}

export interface UseResizeInteractionReturn<TPose extends ResizePose> {
  start(id: string, anchor: ResizeAnchor, worldX: number, worldY: number): void;
  move(worldX: number, worldY: number, modifiers: ModifierState): boolean;
  end(): void;
  cancel(): void;
  isResizing: boolean;
  overlay: ResizeOverlay<TPose> | null;
}

interface State<TPose extends ResizePose> {
  active: boolean;
  id: string | null;
  anchor: ResizeAnchor;
  origin: TPose | null;
  start: { worldX: number; worldY: number };
  ctx: GestureContext<TPose> | null;
  lastCurrent: TPose | null;
}

export function useResizeInteraction<TObject extends { id: string }, TPose extends ResizePose>(
  adapter: ResizeAdapter<TObject, TPose>,
  options: UseResizeInteractionOptions<TPose>,
): UseResizeInteractionReturn<TPose> {
  const {
    behaviors = [],
    resizeLabel = 'Resize',
    onGestureStart,
    onGestureEnd,
  } = options;

  const behaviorsRef = useRef(behaviors);
  behaviorsRef.current = behaviors;

  const stateRef = useRef<State<TPose>>({
    active: false,
    id: null,
    anchor: { x: 'free', y: 'free' },
    origin: null,
    start: { worldX: 0, worldY: 0 },
    ctx: null,
    lastCurrent: null,
  });

  const [overlay, setOverlay] = useState<ResizeOverlay<TPose> | null>(null);

  const cleanup = useCallback(() => {
    stateRef.current.active = false;
    stateRef.current.id = null;
    stateRef.current.origin = null;
    stateRef.current.ctx = null;
    stateRef.current.lastCurrent = null;
    setOverlay(null);
  }, []);

  const start = useCallback((id: string, anchor: ResizeAnchor, worldX: number, worldY: number) => {
    const origin = adapter.getPose(id);
    const ctx: GestureContext<TPose> = {
      draggedIds: [id],
      origin: new Map([[id, origin]]),
      current: new Map([[id, origin]]),
      snap: null,
      modifiers: { alt: false, shift: false, meta: false, ctrl: false },
      pointer: { worldX, worldY, clientX: 0, clientY: 0 },
      adapter: adapter as unknown as GestureContext<TPose>['adapter'],
      scratch: {},
    };
    stateRef.current = {
      active: true,
      id,
      anchor,
      origin,
      start: { worldX, worldY },
      ctx,
      lastCurrent: origin,
    };
    for (const b of behaviorsRef.current) b.onStart?.(ctx);
    onGestureStart?.(id);
    setOverlay({ id, currentPose: origin, targetPose: origin, anchor });
  }, [adapter, onGestureStart]);

  const move = useCallback((/* implemented next commit */
    _wx: number, _wy: number, _mods: ModifierState,
  ): boolean => {
    return stateRef.current.active;
  }, []);

  const end = useCallback(() => {
    if (!stateRef.current.active) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  const cancel = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  return { start, move, end, cancel, isResizing: stateRef.current.active, overlay };
}
```

- [ ] **Step 5.4: Run tests — pass**

```
npm test -- --run src/canvas-kit/interactions/resize/resize.test.ts
```
Expected: PASS.

- [ ] **Step 5.5: Commit**

```
git add src/canvas-kit/interactions/resize/resize.ts src/canvas-kit/interactions/resize/resize.test.ts
git commit -m "feat(canvas-kit): scaffold useResizeInteraction (start/cancel)"
```

#### Commit 5b: move with anchor-driven proposed pose + behaviors + lerp

- [ ] **Step 5.6: Add failing tests for move + behaviors + lerp**

Append to `src/canvas-kit/interactions/resize/resize.test.ts`:

```ts
describe('useResizeInteraction — move', () => {
  it('east anchor=min: width grows toward target; currentPose lerps 35%', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() => useResizeInteraction<{ id: string }, P>(adapter, {}));
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    // Drag east 4 units (worldX = 14 from start at 10). Target width = 14 - 0 = 14.
    act(() => {
      result.current.move(14, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    const ov = result.current.overlay!;
    expect(ov.targetPose).toEqual({ x: 0, y: 0, width: 14, height: 10 });
    // currentPose = origin (10) lerped 35% toward 14 = 11.4
    expect(ov.currentPose.width).toBeCloseTo(11.4, 5);
  });

  it('behaviors compose in order; clampMinSize integrates', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, {
        behaviors: [clampMinSize<P>({ minWidth: 1, minHeight: 1 })],
      }),
    );
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    // Drag west past origin so naive width = -2; clamp must hold width=1.
    act(() => {
      result.current.move(-2, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    expect(result.current.overlay!.targetPose.width).toBe(1);
  });

  it('snapToGrid integrates: targetPose snaps; sub-grid origin suspends snap', () => {
    const { adapter, state } = makeAdapter();
    state.set('a', { x: 0, y: 0, width: 0.5, height: 10 }); // origin sub-grid on x
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, {
        behaviors: [snapToGrid<P>({ cell: 1 })],
      }),
    );
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 0.5, 0);
    });
    act(() => {
      result.current.move(0.7, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    // Sub-grid suspends snap on x; width tracks pointer delta (0.2 added to 0.5 = 0.7).
    expect(result.current.overlay!.targetPose.width).toBeCloseTo(0.7, 5);
  });
});
```

- [ ] **Step 5.7: Run — fail**

Expected: FAIL — `move` is currently a no-op.

- [ ] **Step 5.8: Implement `move` body**

Replace the `move` callback in `src/canvas-kit/interactions/resize/resize.ts`:

```ts
const move = useCallback((worldX: number, worldY: number, modifiers: ModifierState): boolean => {
  const s = stateRef.current;
  if (!s.active || !s.ctx || !s.origin || !s.id) return false;

  s.ctx.modifiers = modifiers;
  s.ctx.pointer = { worldX, worldY, clientX: 0, clientY: 0 };

  const dx = worldX - s.start.worldX;
  const dy = worldY - s.start.worldY;
  const o = s.origin;

  // Build the naive (unsnapped, unclamped) proposed pose by translating
  // the anchor-driven edges.
  let nx = o.x;
  let ny = o.y;
  let nw = o.width;
  let nh = o.height;
  if (s.anchor.x === 'min') {
    nw = o.width + dx; // east edge moves
  } else if (s.anchor.x === 'max') {
    nx = o.x + dx; // west edge moves
    nw = o.width - dx;
  }
  if (s.anchor.y === 'min') {
    nh = o.height + dy;
  } else if (s.anchor.y === 'max') {
    ny = o.y + dy;
    nh = o.height - dy;
  }
  let proposed: TPose = { ...o, x: nx, y: ny, width: nw, height: nh };

  // Run behaviors.
  for (const b of behaviorsRef.current) {
    const r = b.onMove?.(s.ctx, { pose: proposed, anchor: s.anchor });
    if (!r) continue;
    if (r.pose !== undefined) proposed = r.pose;
  }

  s.ctx.current = new Map([[s.id, proposed]]);

  // Lerp currentPose 35% toward proposed.
  const last = s.lastCurrent ?? o;
  const lerp = (a: number, b: number) => a + (b - a) * LERP;
  const currentPose: TPose = {
    ...proposed,
    x: lerp(last.x, proposed.x),
    y: lerp(last.y, proposed.y),
    width: lerp(last.width, proposed.width),
    height: lerp(last.height, proposed.height),
  };
  s.lastCurrent = currentPose;

  setOverlay({ id: s.id, currentPose, targetPose: proposed, anchor: s.anchor });
  return true;
}, []);
```

- [ ] **Step 5.9: Run — pass**

```
npm test -- --run src/canvas-kit/interactions/resize/resize.test.ts
```
Expected: PASS.

- [ ] **Step 5.10: Commit**

```
git add src/canvas-kit/interactions/resize/resize.ts src/canvas-kit/interactions/resize/resize.test.ts
git commit -m "feat(canvas-kit): useResizeInteraction move + behavior pipeline + lerp"
```

#### Commit 5c: end emits TransformOp; behaviors onEnd; isResizing reactivity

- [ ] **Step 5.11: Add failing tests for end / onEnd / isResizing**

Append to `src/canvas-kit/interactions/resize/resize.test.ts`:

```ts
describe('useResizeInteraction — end', () => {
  it('emits one TransformOp using targetPose (not lerped currentPose)', () => {
    const { adapter, batches, state } = makeAdapter();
    const { result } = renderHook(() => useResizeInteraction<{ id: string }, P>(adapter, {}));
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    act(() => {
      result.current.move(14, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].label).toBe('Resize');
    expect(batches[0].ops).toHaveLength(1);
    // After apply, store reflects the target (width 14), not the lerped 11.4.
    expect(state.get('a')).toEqual({ x: 0, y: 0, width: 14, height: 10 });
  });

  it('end with no move emits no batch', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() => useResizeInteraction<{ id: string }, P>(adapter, {}));
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toEqual([]);
  });

  it('behavior onEnd returning Op[] overrides default', () => {
    const { adapter, batches } = makeAdapter();
    const customOp: Op = {
      apply() {},
      invert() { return customOp; },
      label: 'Custom',
    };
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, {
        behaviors: [{ onEnd: () => [customOp] }],
      }),
    );
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    act(() => {
      result.current.move(14, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].ops[0]).toBe(customOp);
  });

  it('behavior onEnd returning null aborts (no batch)', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, {
        behaviors: [{ onEnd: () => null }],
      }),
    );
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    act(() => {
      result.current.move(14, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toEqual([]);
  });
});
```

- [ ] **Step 5.12: Run — fail**

Expected: FAIL — current `end` is a no-op stub. Also `isResizing` is read once and won't reflect updates; we need to drive it from overlay state.

- [ ] **Step 5.13: Replace `end` and the return value**

In `src/canvas-kit/interactions/resize/resize.ts`, replace the `end` callback and the final `return`:

```ts
const end = useCallback(() => {
  const s = stateRef.current;
  if (!s.active || !s.ctx || !s.origin || !s.id || !s.lastCurrent) {
    cleanup();
    onGestureEnd?.(false);
    return;
  }
  const ctx = s.ctx;
  const targetPose = ctx.current.get(s.id)!;

  // No movement (target == origin) means no batch.
  const moved =
    targetPose.x !== s.origin.x ||
    targetPose.y !== s.origin.y ||
    targetPose.width !== s.origin.width ||
    targetPose.height !== s.origin.height;

  let ops: Op[] | null | undefined;
  for (const b of behaviorsRef.current) {
    const r = b.onEnd?.(ctx);
    if (r === undefined) continue;
    ops = r;
    break;
  }
  if (ops === null) {
    cleanup();
    onGestureEnd?.(false);
    return;
  }
  if (ops === undefined) {
    if (!moved) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }
    ops = [
      createTransformOp<TPose>({
        id: s.id,
        from: s.origin,
        to: targetPose,
        label: resizeLabel,
      }),
    ];
  }
  if (ops.length > 0) {
    adapter.applyBatch(ops, ops[0].label ?? resizeLabel);
  }
  cleanup();
  onGestureEnd?.(true);
}, [adapter, cleanup, onGestureEnd, resizeLabel]);
```

Replace the return so `isResizing` reflects overlay presence:

```ts
return { start, move, end, cancel, isResizing: overlay !== null, overlay };
```

- [ ] **Step 5.14: Run — pass**

```
npm test -- --run src/canvas-kit/interactions/resize/resize.test.ts
```
Expected: PASS.

- [ ] **Step 5.15: Wire hook export through resize barrel**

Replace `src/canvas-kit/interactions/resize/index.ts`:

```ts
export { useResizeInteraction } from './resize';
export type {
  UseResizeInteractionOptions,
  UseResizeInteractionReturn,
} from './resize';
export * from './behaviors';
```

Update `src/canvas-kit/index.ts` to add the resize hook export at top level (the hook itself, not the snapToGrid behavior):

```ts
export { useResizeInteraction } from './interactions/resize';
export type {
  UseResizeInteractionOptions,
  UseResizeInteractionReturn,
} from './interactions/resize';
```

- [ ] **Step 5.16: Run full suite**

```
npm test -- --run
```
Expected: PASS.

- [ ] **Step 5.17: Commit**

```
git add src/canvas-kit/interactions/resize/ src/canvas-kit/index.ts
git commit -m "feat(canvas-kit): useResizeInteraction end emits TransformOp; export hook"
```

---

### Task 6: zoneResizeAdapter + structureResizeAdapter

Mirror `src/canvas/adapters/zoneMove.ts` shape. Each is small (~30-50 lines). `applyBatch` calls `useGardenStore.getState().checkpoint()` then applies ops in order.

**Files:**
- Create: `src/canvas/adapters/zoneResize.ts`
- Create: `src/canvas/adapters/zoneResize.test.ts`
- Create: `src/canvas/adapters/structureResize.ts`
- Create: `src/canvas/adapters/structureResize.test.ts`

- [ ] **Step 6.1: Write failing test for `zoneResizeAdapter`**

`src/canvas/adapters/zoneResize.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { createZoneResizeAdapter } from './zoneResize';
import { createTransformOp } from '@/canvas-kit';

describe('createZoneResizeAdapter', () => {
  beforeEach(() => {
    useGardenStore.setState((s) => ({
      garden: {
        ...s.garden,
        zones: [{ id: 'z1', x: 1, y: 2, width: 4, height: 5, color: '#abc', pattern: null }],
      },
    }));
  });

  it('getPose returns x/y/width/height', () => {
    const a = createZoneResizeAdapter();
    expect(a.getPose('z1')).toEqual({ x: 1, y: 2, width: 4, height: 5 });
  });

  it('getObject returns the zone', () => {
    const a = createZoneResizeAdapter();
    expect(a.getObject('z1')?.id).toBe('z1');
    expect(a.getObject('missing')).toBeUndefined();
  });

  it('applyBatch checkpoints + applies; undo restores', () => {
    const a = createZoneResizeAdapter();
    const before = useGardenStore.getState().garden.zones[0];
    a.applyBatch(
      [createTransformOp({ id: 'z1', from: before, to: { ...before, width: 10, height: 10 } })],
      'Resize',
    );
    expect(useGardenStore.getState().garden.zones[0].width).toBe(10);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.zones[0].width).toBe(4);
  });
});
```

- [ ] **Step 6.2: Run — fail (module not found)**

```
npm test -- --run src/canvas/adapters/zoneResize.test.ts
```

- [ ] **Step 6.3: Implement `zoneResize.ts`**

`src/canvas/adapters/zoneResize.ts`:

```ts
import { useGardenStore } from '../../store/gardenStore';
import type { Zone } from '../../model/types';
import type { ResizeAdapter } from '@/canvas-kit';

export interface ZoneResizePose { x: number; y: number; width: number; height: number }

export function createZoneResizeAdapter(): ResizeAdapter<Zone, ZoneResizePose> {
  function getZone(id: string): Zone | undefined {
    return useGardenStore.getState().garden.zones.find((z) => z.id === id);
  }
  const adapter: ResizeAdapter<Zone, ZoneResizePose> = {
    getObject(id) {
      return getZone(id);
    },
    getPose(id) {
      const z = getZone(id);
      if (!z) throw new Error(`zone not found: ${id}`);
      return { x: z.x, y: z.y, width: z.width, height: z.height };
    },
    setPose(id, pose) {
      useGardenStore.getState().updateZone(id, {
        x: pose.x,
        y: pose.y,
        width: pose.width,
        height: pose.height,
      });
    },
    applyBatch(ops, _label) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter);
    },
  };
  return adapter;
}
```

- [ ] **Step 6.4: Run — pass**

```
npm test -- --run src/canvas/adapters/zoneResize.test.ts
```

- [ ] **Step 6.5: Repeat for `structureResizeAdapter`**

`src/canvas/adapters/structureResize.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { createStructureResizeAdapter } from './structureResize';
import { createTransformOp } from '@/canvas-kit';

describe('createStructureResizeAdapter', () => {
  beforeEach(() => {
    useGardenStore.setState((s) => ({
      garden: {
        ...s.garden,
        structures: [{ id: 's1', type: 'bed', x: 0, y: 0, width: 4, height: 4, parentId: '' }],
      },
    }));
  });

  it('getPose returns dimensions', () => {
    const a = createStructureResizeAdapter();
    expect(a.getPose('s1')).toEqual({ x: 0, y: 0, width: 4, height: 4 });
  });

  it('applyBatch checkpoints + undo restores', () => {
    const a = createStructureResizeAdapter();
    const before = useGardenStore.getState().garden.structures[0];
    a.applyBatch(
      [createTransformOp({
        id: 's1',
        from: { x: before.x, y: before.y, width: before.width, height: before.height },
        to: { x: 0, y: 0, width: 8, height: 8 },
      })],
      'Resize',
    );
    expect(useGardenStore.getState().garden.structures[0].width).toBe(8);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures[0].width).toBe(4);
  });
});
```

`src/canvas/adapters/structureResize.ts`:

```ts
import { useGardenStore } from '../../store/gardenStore';
import type { Structure } from '../../model/types';
import type { ResizeAdapter } from '@/canvas-kit';

export interface StructureResizePose { x: number; y: number; width: number; height: number }

export function createStructureResizeAdapter(): ResizeAdapter<Structure, StructureResizePose> {
  function getStructure(id: string): Structure | undefined {
    return useGardenStore.getState().garden.structures.find((s) => s.id === id);
  }
  const adapter: ResizeAdapter<Structure, StructureResizePose> = {
    getObject(id) {
      return getStructure(id);
    },
    getPose(id) {
      const s = getStructure(id);
      if (!s) throw new Error(`structure not found: ${id}`);
      return { x: s.x, y: s.y, width: s.width, height: s.height };
    },
    setPose(id, pose) {
      useGardenStore.getState().updateStructure(id, {
        x: pose.x,
        y: pose.y,
        width: pose.width,
        height: pose.height,
      });
    },
    applyBatch(ops, _label) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter);
    },
  };
  return adapter;
}
```

- [ ] **Step 6.6: Run — pass**

```
npm test -- --run src/canvas/adapters/structureResize.test.ts
```

- [ ] **Step 6.7: Commit**

```
git add src/canvas/adapters/zoneResize.ts src/canvas/adapters/zoneResize.test.ts src/canvas/adapters/structureResize.ts src/canvas/adapters/structureResize.test.ts
git commit -m "feat(garden): add zoneResize and structureResize adapters"
```

---

### Task 7: insert/snapToGrid behavior

Snaps `start` once at gesture start (via `onStart`) and `current` each `onMove`. Bypass via modifier.

The `onStart` hook can't return a result (per the `GestureBehavior` interface — onStart is `void`). To set the start pose, the behavior overwrites `ctx.origin` for the dragged id directly. The hook reads `origin` when computing the proposed pose on the next move, so overwriting at `onStart` is the right seam.

**Files:**
- Create: `src/canvas-kit/interactions/insert/behaviors/snapToGrid.test.ts`
- Create: `src/canvas-kit/interactions/insert/behaviors/snapToGrid.ts`

- [ ] **Step 7.1: Write failing tests**

`src/canvas-kit/interactions/insert/behaviors/snapToGrid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { snapToGrid } from './snapToGrid';
import type {
  GestureContext,
  InsertProposed,
  ModifierState,
} from '../../types';

interface P { x: number; y: number }

function ctx(start: P, mods: Partial<ModifierState> = {}): GestureContext<P> {
  return {
    draggedIds: ['gesture'],
    origin: new Map([['gesture', start]]),
    current: new Map([['gesture', start]]),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false, ...mods },
    pointer: { worldX: 0, worldY: 0, clientX: 0, clientY: 0 },
    adapter: {} as never,
    scratch: {},
  };
}

function proposed(start: P, current: P): InsertProposed<P> {
  return { start, current };
}

describe('insert/snapToGrid', () => {
  const b = snapToGrid<P>({ cell: 1 });

  it('onStart snaps origin to grid', () => {
    const c = ctx({ x: 0.7, y: 0.3 });
    b.onStart!(c);
    expect(c.origin.get('gesture')).toEqual({ x: 1, y: 0 });
  });

  it('onMove returns snapped current; passes start through', () => {
    const c = ctx({ x: 1, y: 0 });
    const r = b.onMove!(c, proposed({ x: 1, y: 0 }, { x: 4.6, y: 2.3 }));
    expect(r).toEqual({ current: { x: 5, y: 2 } });
  });

  it('bypassKey skips both', () => {
    const b2 = snapToGrid<P>({ cell: 1, bypassKey: 'alt' });
    const c = ctx({ x: 0.7, y: 0.3 }, { alt: true });
    b2.onStart!(c);
    expect(c.origin.get('gesture')).toEqual({ x: 0.7, y: 0.3 }); // unchanged
    const r = b2.onMove!(c, proposed({ x: 0.7, y: 0.3 }, { x: 4.6, y: 2.3 }));
    expect(r).toBeUndefined();
  });
});
```

- [ ] **Step 7.2: Run — fail**

```
npm test -- --run src/canvas-kit/interactions/insert/behaviors/snapToGrid.test.ts
```

- [ ] **Step 7.3: Implement**

`src/canvas-kit/interactions/insert/behaviors/snapToGrid.ts`:

```ts
import type {
  InsertBehavior,
  ModifierState,
} from '../../types';

type ModKey = keyof ModifierState;

export function snapToGrid<TPose extends { x: number; y: number }>(args: {
  cell: number;
  bypassKey?: ModKey;
}): InsertBehavior<TPose> {
  const { cell, bypassKey } = args;
  const round = (v: number) => Math.round(v / cell) * cell;
  return {
    onStart(ctx) {
      if (bypassKey && ctx.modifiers[bypassKey]) return;
      const id = ctx.draggedIds[0];
      const o = ctx.origin.get(id);
      if (!o) return;
      ctx.origin.set(id, { ...o, x: round(o.x), y: round(o.y) } as TPose);
    },
    onMove(ctx, { current }) {
      if (bypassKey && ctx.modifiers[bypassKey]) return;
      return { current: { ...current, x: round(current.x), y: round(current.y) } as TPose };
    },
  };
}
```

- [ ] **Step 7.4: Run — pass**

- [ ] **Step 7.5: Add insert behaviors barrel + insert subpath proxy**

`src/canvas-kit/interactions/insert/behaviors/index.ts`:

```ts
export { snapToGrid } from './snapToGrid';
```

`src/canvas-kit/interactions/insert/index.ts` (placeholder; hook added in Task 8):

```ts
export * from './behaviors';
```

`src/canvas-kit/insert.ts`:

```ts
export * from './interactions/insert';
```

- [ ] **Step 7.6: Commit**

```
git add src/canvas-kit/interactions/insert/ src/canvas-kit/insert.ts
git commit -m "feat(canvas-kit): add insert/snapToGrid behavior"
```

---

### Task 8: useInsertInteraction hook

API mirrors `useResizeInteraction` shape but the gesture has no pre-existing object.

**Files:**
- Create: `src/canvas-kit/interactions/insert/insert.test.ts`
- Create: `src/canvas-kit/interactions/insert/insert.ts`
- Modify: `src/canvas-kit/interactions/insert/index.ts`
- Modify: `src/canvas-kit/index.ts`

#### Commit 8a: scaffold start / cancel

- [ ] **Step 8.1: Write tests for start / cancel**

`src/canvas-kit/interactions/insert/insert.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInsertInteraction } from './insert';
import { snapToGrid } from './behaviors/snapToGrid';
import type { Op } from '../../ops/types';
import type { InsertAdapter } from '../../adapters/types';

interface Obj { id: string; x: number; y: number; width: number; height: number }

function makeAdapter(opts?: { commitReturnsNull?: boolean }) {
  const inserts: Obj[] = [];
  const batches: { ops: Op[]; label: string }[] = [];
  const adapter: InsertAdapter<Obj> = {
    commitInsert(b) {
      if (opts?.commitReturnsNull) return null;
      const obj: Obj = { id: `obj-${inserts.length}`, x: b.x, y: b.y, width: b.width, height: b.height };
      return obj;
    },
    applyBatch(ops, label) {
      batches.push({ ops, label });
      // Simulate insertObject side-effect by recording.
      for (const op of ops) {
        op.apply({
          insertObject: (o: Obj) => inserts.push(o),
          removeObject: () => {},
        });
      }
    },
  };
  return { adapter, inserts, batches };
}

describe('useInsertInteraction — start/cancel', () => {
  it('start sets isInserting and overlay', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(1, 2, { alt: false, shift: false, meta: false, ctrl: false });
    });
    expect(result.current.isInserting).toBe(true);
    expect(result.current.overlay).toEqual({ start: { x: 1, y: 2 }, current: { x: 1, y: 2 } });
  });

  it('cancel clears overlay; no batch', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(1, 2, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.cancel();
    });
    expect(result.current.overlay).toBeNull();
    expect(batches).toEqual([]);
  });
});
```

- [ ] **Step 8.2: Run — fail**

- [ ] **Step 8.3: Implement scaffold**

`src/canvas-kit/interactions/insert/insert.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import { createCreateOp } from '../../ops/create';
import type { Op } from '../../ops/types';
import type { InsertAdapter } from '../../adapters/types';
import type {
  GestureContext,
  InsertBehavior,
  InsertOverlay,
  ModifierState,
} from '../types';

export interface UseInsertInteractionOptions<TPose extends { x: number; y: number }> {
  behaviors?: InsertBehavior<TPose>[];
  insertLabel?: string;
  /** Strictly-greater-than thresholds; bounds with width <= or height <= abort. Default { width: 0, height: 0 }. */
  minBounds?: { width: number; height: number };
  onGestureStart?: () => void;
  onGestureEnd?: (committed: boolean) => void;
}

export interface UseInsertInteractionReturn<TPose extends { x: number; y: number }> {
  start(worldX: number, worldY: number, modifiers: ModifierState): void;
  move(worldX: number, worldY: number, modifiers: ModifierState): boolean;
  end(): void;
  cancel(): void;
  isInserting: boolean;
  overlay: InsertOverlay<TPose> | null;
}

const GID = 'gesture';

export function useInsertInteraction<TObject extends { id: string }, TPose extends { x: number; y: number }>(
  adapter: InsertAdapter<TObject>,
  options: UseInsertInteractionOptions<TPose>,
): UseInsertInteractionReturn<TPose> {
  const {
    behaviors = [],
    insertLabel = 'Insert',
    minBounds = { width: 0, height: 0 },
    onGestureStart,
    onGestureEnd,
  } = options;

  const behaviorsRef = useRef(behaviors);
  behaviorsRef.current = behaviors;

  const stateRef = useRef<{ active: boolean; ctx: GestureContext<TPose> | null }>({
    active: false,
    ctx: null,
  });
  const [overlay, setOverlay] = useState<InsertOverlay<TPose> | null>(null);

  const cleanup = useCallback(() => {
    stateRef.current.active = false;
    stateRef.current.ctx = null;
    setOverlay(null);
  }, []);

  const start = useCallback((worldX: number, worldY: number, modifiers: ModifierState) => {
    const startPose = { x: worldX, y: worldY } as TPose;
    const ctx: GestureContext<TPose> = {
      draggedIds: [GID],
      origin: new Map([[GID, startPose]]),
      current: new Map([[GID, startPose]]),
      snap: null,
      modifiers,
      pointer: { worldX, worldY, clientX: 0, clientY: 0 },
      adapter: adapter as unknown as GestureContext<TPose>['adapter'],
      scratch: {},
    };
    for (const b of behaviorsRef.current) b.onStart?.(ctx);
    stateRef.current = { active: true, ctx };
    onGestureStart?.();
    const snappedStart = ctx.origin.get(GID)!;
    setOverlay({ start: snappedStart, current: snappedStart });
  }, [adapter, onGestureStart]);

  const move = useCallback((/* implemented next commit */
    _wx: number, _wy: number, _mods: ModifierState,
  ): boolean => {
    return stateRef.current.active;
  }, []);

  const end = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  const cancel = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  return { start, move, end, cancel, isInserting: overlay !== null, overlay };
}
```

- [ ] **Step 8.4: Run — pass**

```
npm test -- --run src/canvas-kit/interactions/insert/insert.test.ts
```

- [ ] **Step 8.5: Commit**

```
git add src/canvas-kit/interactions/insert/insert.ts src/canvas-kit/interactions/insert/insert.test.ts
git commit -m "feat(canvas-kit): scaffold useInsertInteraction (start/cancel)"
```

#### Commit 8b: move + end happy path + abort cases

- [ ] **Step 8.6: Add failing tests for move and end**

Append to `src/canvas-kit/interactions/insert/insert.test.ts`:

```ts
describe('useInsertInteraction — move + end', () => {
  it('move updates overlay.current; behaviors compose', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() =>
      useInsertInteraction<Obj, { x: number; y: number }>(adapter, {
        behaviors: [snapToGrid<{ x: number; y: number }>({ cell: 1 })],
      }),
    );
    act(() => {
      result.current.start(0.7, 0.3, { alt: false, shift: false, meta: false, ctrl: false });
    });
    // start was snapped to (1, 0).
    expect(result.current.overlay).toEqual({ start: { x: 1, y: 0 }, current: { x: 1, y: 0 } });
    act(() => {
      result.current.move(4.6, 2.3, { alt: false, shift: false, meta: false, ctrl: false });
    });
    expect(result.current.overlay).toEqual({ start: { x: 1, y: 0 }, current: { x: 5, y: 2 } });
  });

  it('end emits one CreateOp on happy path', () => {
    const { adapter, batches, inserts } = makeAdapter();
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(0, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.move(4, 3, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].label).toBe('Insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ x: 0, y: 0, width: 4, height: 3 });
  });

  it('inverted drag bounds use min(start, current) and abs(delta)', () => {
    const { adapter, inserts } = makeAdapter();
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(5, 5, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.move(2, 3, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(inserts[0]).toMatchObject({ x: 2, y: 3, width: 3, height: 2 });
  });

  it('degenerate bounds (zero width or height) abort with no batch', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(0, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.move(0, 4, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toEqual([]);
  });

  it('commitInsert returning null aborts', () => {
    const { adapter, batches } = makeAdapter({ commitReturnsNull: true });
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(0, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.move(4, 3, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toEqual([]);
  });

  it('minBounds: bounds with width <= minBounds.width abort', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() =>
      useInsertInteraction<Obj, { x: number; y: number }>(adapter, {
        minBounds: { width: 0.1, height: 0.1 },
      }),
    );
    act(() => {
      result.current.start(0, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.move(0.05, 5, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toEqual([]);
  });
});
```

- [ ] **Step 8.7: Run — fail**

- [ ] **Step 8.8: Replace `move` and `end` in `insert.ts`**

```ts
const move = useCallback((worldX: number, worldY: number, modifiers: ModifierState): boolean => {
  const s = stateRef.current;
  if (!s.active || !s.ctx) return false;
  const ctx = s.ctx;
  ctx.modifiers = modifiers;
  ctx.pointer = { worldX, worldY, clientX: 0, clientY: 0 };
  let current = { ...(ctx.current.get(GID) as TPose), x: worldX, y: worldY } as TPose;
  let startPose = ctx.origin.get(GID)!;

  for (const b of behaviorsRef.current) {
    const r = b.onMove?.(ctx, { start: startPose, current });
    if (!r) continue;
    if (r.current !== undefined) current = r.current;
    if (r.start !== undefined) {
      startPose = r.start;
      ctx.origin.set(GID, startPose);
    }
  }
  ctx.current.set(GID, current);
  setOverlay({ start: startPose, current });
  return true;
}, []);

const end = useCallback(() => {
  const s = stateRef.current;
  if (!s.active || !s.ctx) {
    cleanup();
    onGestureEnd?.(false);
    return;
  }
  const ctx = s.ctx;
  const sp = ctx.origin.get(GID)!;
  const cp = ctx.current.get(GID)!;
  const x = Math.min(sp.x, cp.x);
  const y = Math.min(sp.y, cp.y);
  const width = Math.abs(cp.x - sp.x);
  const height = Math.abs(cp.y - sp.y);
  if (width <= minBounds.width || height <= minBounds.height) {
    cleanup();
    onGestureEnd?.(false);
    return;
  }
  const created = adapter.commitInsert({ x, y, width, height });
  if (!created) {
    cleanup();
    onGestureEnd?.(false);
    return;
  }
  const ops: Op[] = [createCreateOp({ object: created, label: insertLabel })];
  adapter.applyBatch(ops, insertLabel);
  cleanup();
  onGestureEnd?.(true);
}, [adapter, cleanup, insertLabel, minBounds.height, minBounds.width, onGestureEnd]);
```

- [ ] **Step 8.9: Run — pass**

```
npm test -- --run src/canvas-kit/interactions/insert/insert.test.ts
```

- [ ] **Step 8.10: Wire hook export**

Replace `src/canvas-kit/interactions/insert/index.ts`:

```ts
export { useInsertInteraction } from './insert';
export type {
  UseInsertInteractionOptions,
  UseInsertInteractionReturn,
} from './insert';
export * from './behaviors';
```

Add to `src/canvas-kit/index.ts`:

```ts
export { useInsertInteraction } from './interactions/insert';
export type {
  UseInsertInteractionOptions,
  UseInsertInteractionReturn,
} from './interactions/insert';
```

- [ ] **Step 8.11: Run full suite**

```
npm test -- --run
```
Expected: PASS.

- [ ] **Step 8.12: Commit**

```
git add src/canvas-kit/interactions/insert/ src/canvas-kit/index.ts
git commit -m "feat(canvas-kit): useInsertInteraction move + end emits CreateOp"
```

---

### Task 9: insertAdapter

Reads `useUiStore.getState().plottingTool` in `commitInsert`. Returns `null` if no tool. Constructs Structure or Zone object based on `plottingTool.category`.

**Files:**
- Create: `src/canvas/adapters/insert.test.ts`
- Create: `src/canvas/adapters/insert.ts`

The legacy `usePlotInteraction.end` calls `addStructure({ type, x, y, width, height })` or `addZone({ x, y, width, height, color, pattern })` directly on the store. The store auto-assigns ids. To make `commitInsert` return the constructed object (which the kit then wraps in a CreateOp), we use a different mutation path: we construct the object with our own id, then `applyBatch` calls `insertObject` (an adapter-level mutator) to drop it into the store.

The kit's `createCreateOp` requires the adapter to expose `insertObject`. So `insertAdapter` adds that mutator alongside `applyBatch` and `commitInsert`.

- [ ] **Step 9.1: Write failing tests**

`src/canvas/adapters/insert.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createInsertAdapter } from './insert';
import { createCreateOp } from '@/canvas-kit';

describe('createInsertAdapter', () => {
  beforeEach(() => {
    useUiStore.setState({ plottingTool: null } as never);
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [], zones: [] },
    }));
  });

  it('commitInsert returns null when no plottingTool active', () => {
    const a = createInsertAdapter();
    expect(a.commitInsert({ x: 0, y: 0, width: 1, height: 1 })).toBeNull();
  });

  it('commitInsert builds a Structure when category=structures', () => {
    useUiStore.setState({
      plottingTool: { category: 'structures', type: 'bed', color: '#abc' } as never,
    } as never);
    const a = createInsertAdapter();
    const obj = a.commitInsert({ x: 1, y: 2, width: 3, height: 4 });
    expect(obj).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });
    expect((obj as { type: string }).type).toBe('bed');
    expect(typeof obj!.id).toBe('string');
  });

  it('commitInsert builds a Zone when category=zones', () => {
    useUiStore.setState({
      plottingTool: { category: 'zones', color: '#abc', pattern: null } as never,
    } as never);
    const a = createInsertAdapter();
    const obj = a.commitInsert({ x: 1, y: 2, width: 3, height: 4 });
    expect(obj).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('applyBatch checkpoints + applies CreateOp; undo restores', () => {
    useUiStore.setState({
      plottingTool: { category: 'zones', color: '#abc', pattern: null } as never,
    } as never);
    const a = createInsertAdapter();
    const obj = a.commitInsert({ x: 0, y: 0, width: 2, height: 2 })!;
    a.applyBatch([createCreateOp({ object: obj })], 'Insert');
    expect(useGardenStore.getState().garden.zones).toHaveLength(1);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.zones).toHaveLength(0);
  });
});
```

- [ ] **Step 9.2: Run — fail**

```
npm test -- --run src/canvas/adapters/insert.test.ts
```

- [ ] **Step 9.3: Implement `insertAdapter`**

`src/canvas/adapters/insert.ts`:

```ts
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { Structure, Zone } from '../../model/types';
import type { InsertAdapter, Op } from '@/canvas-kit';

type GardenObj = (Structure | Zone) & { id: string };

export interface GardenInsertAdapter extends InsertAdapter<GardenObj> {
  insertObject(obj: GardenObj): void;
  removeObject(id: string): void;
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createInsertAdapter(): GardenInsertAdapter {
  const adapter: GardenInsertAdapter = {
    commitInsert(b) {
      const tool = useUiStore.getState().plottingTool;
      if (!tool) return null;
      if (tool.category === 'structures') {
        const s: Structure = {
          id: makeId('s'),
          type: tool.type,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          parentId: '',
        };
        return s as GardenObj;
      }
      if (tool.category === 'zones') {
        const z: Zone = {
          id: makeId('z'),
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          color: tool.color,
          pattern: tool.pattern ?? null,
        };
        return z as GardenObj;
      }
      return null;
    },
    insertObject(obj) {
      // Decide layer by structural shape: a structure has `type`, a zone doesn't.
      if ('type' in obj) {
        useGardenStore.setState((st) => ({
          garden: { ...st.garden, structures: [...st.garden.structures, obj as Structure] },
        }));
      } else {
        useGardenStore.setState((st) => ({
          garden: { ...st.garden, zones: [...st.garden.zones, obj as Zone] },
        }));
      }
    },
    removeObject(id) {
      useGardenStore.setState((st) => ({
        garden: {
          ...st.garden,
          structures: st.garden.structures.filter((s) => s.id !== id),
          zones: st.garden.zones.filter((z) => z.id !== id),
        },
      }));
    },
    applyBatch(ops: Op[], _label: string) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter);
    },
  };
  return adapter;
}
```

- [ ] **Step 9.4: Run — pass**

```
npm test -- --run src/canvas/adapters/insert.test.ts
```

- [ ] **Step 9.5: Commit**

```
git add src/canvas/adapters/insert.ts src/canvas/adapters/insert.test.ts
git commit -m "feat(garden): add insertAdapter dispatching by plottingTool.category"
```

---

### Task 10: CanvasStack migration

Wire the three new hooks. Drop old `useResizeInteraction`/`usePlotInteraction` imports. Add overlay-mirror effects. Add `handlePositionToAnchor(handle: HandlePosition): ResizeAnchor` helper. Re-route mouse-down/move/up dispatch.

This task is integration. It does NOT delete the old hook files (Task 12 does that).

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`
- Modify: `src/store/uiStore.ts` (add `resizeOverlay`, `insertOverlay`)

#### Commit 10a: uiStore overlay state

- [ ] **Step 10.1: Add overlay state to `src/store/uiStore.ts`**

In `src/store/uiStore.ts:59` (where `dragOverlay` is declared), add:

```ts
resizeOverlay: ResizeOverlayUi | null;
insertOverlay: InsertOverlayUi | null;
```

Where (defined at top of file alongside `DragOverlay`):

```ts
export interface ResizeOverlayUi {
  id: string;
  layer: 'structures' | 'zones';
  currentPose: { x: number; y: number; width: number; height: number };
  targetPose: { x: number; y: number; width: number; height: number };
}

export interface InsertOverlayUi {
  start: { x: number; y: number };
  current: { x: number; y: number };
}
```

In the actions block (around line 100), add:

```ts
setResizeOverlay: (overlay: ResizeOverlayUi | null) => void;
setInsertOverlay: (overlay: InsertOverlayUi | null) => void;
```

In the initial state (line ~169) add:

```ts
resizeOverlay: null as ResizeOverlayUi | null,
insertOverlay: null as InsertOverlayUi | null,
```

In the actions implementation (line ~192) add:

```ts
setResizeOverlay: (overlay) => set({ resizeOverlay: overlay }),
setInsertOverlay: (overlay) => set({ insertOverlay: overlay }),
```

- [ ] **Step 10.2: Run full suite**

```
npm test -- --run
```
Expected: PASS — additive change only.

- [ ] **Step 10.3: Commit**

```
git add src/store/uiStore.ts
git commit -m "feat(uiStore): add resizeOverlay and insertOverlay state"
```

#### Commit 10b: CanvasStack wires new hooks

- [ ] **Step 10.4: Add imports + adapter memos in CanvasStack**

In `src/canvas/CanvasStack.tsx`, add near the existing kit move imports (line ~23):

```ts
import {
  useResizeInteraction as useKitResizeInteraction,
  useInsertInteraction as useKitInsertInteraction,
} from '@/canvas-kit';
import { snapToGrid as resizeSnapToGrid, clampMinSize } from '@/canvas-kit/resize';
import { snapToGrid as insertSnapToGrid } from '@/canvas-kit/insert';
import { createZoneResizeAdapter } from './adapters/zoneResize';
import { createStructureResizeAdapter } from './adapters/structureResize';
import { createInsertAdapter } from './adapters/insert';
import type { HandlePosition } from './hitTest';
import type { ResizeAnchor } from '@/canvas-kit';
```

Drop these existing imports (lines 34-35):

```ts
// REMOVE:
import { usePlotInteraction } from './hooks/usePlotInteraction';
import { useResizeInteraction } from './hooks/useResizeInteraction';
```

- [ ] **Step 10.5: Add `handlePositionToAnchor` helper near the top of the component module (above `CanvasStack`)**

```ts
function handlePositionToAnchor(h: HandlePosition): ResizeAnchor {
  // 'min' = the edge AT origin x/y; 'max' = the opposite edge; 'free' = axis not dragged.
  // Map: dragging east edge ('e') means west is anchor → x.min anchors. Etc.
  const x: ResizeAnchor['x'] =
    h === 'e' || h === 'ne' || h === 'se' ? 'min'
    : h === 'w' || h === 'nw' || h === 'sw' ? 'max'
    : 'free';
  const y: ResizeAnchor['y'] =
    h === 's' || h === 'se' || h === 'sw' ? 'min'
    : h === 'n' || h === 'ne' || h === 'nw' ? 'max'
    : 'free';
  return { x, y };
}
```

- [ ] **Step 10.6: Replace the old `resize` and `plot` hook calls (around line 223-225)**

Delete:

```ts
const resize = useResizeInteraction(containerRef);
// (areaSelect line stays)
const plot = usePlotInteraction({ containerRef, selectionCanvasRef, width, height, dpr });
```

Add in their place:

```ts
const zoneResizeAdapter = useMemo(() => createZoneResizeAdapter(), []);
const structureResizeAdapter = useMemo(() => createStructureResizeAdapter(), []);
const insertAdapter = useMemo(() => createInsertAdapter(), []);

const zoneResize = useKitResizeInteraction(zoneResizeAdapter, {
  behaviors: [
    resizeSnapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' }),
    clampMinSize({ minWidth: 0.25, minHeight: 0.25 }),
  ],
});
const structureResize = useKitResizeInteraction(structureResizeAdapter, {
  behaviors: [
    resizeSnapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' }),
    clampMinSize({ minWidth: 0.25, minHeight: 0.25 }),
  ],
});
const insert = useKitInsertInteraction(insertAdapter, {
  behaviors: [insertSnapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' })],
  minBounds: { width: 0.01, height: 0.01 },
});
```

- [ ] **Step 10.7: Mirror new overlays into uiStore**

Add new effects (alongside the existing `dragOverlay` mirror at line ~228):

```ts
useEffect(() => {
  const ov = structureResize.overlay ?? zoneResize.overlay;
  if (!ov) {
    useUiStore.getState().setResizeOverlay(null);
    return;
  }
  const layer: 'structures' | 'zones' = structureResize.overlay ? 'structures' : 'zones';
  useUiStore.getState().setResizeOverlay({
    id: ov.id,
    layer,
    currentPose: ov.currentPose,
    targetPose: ov.targetPose,
  });
}, [structureResize.overlay, zoneResize.overlay]);

useEffect(() => {
  const ov = insert.overlay;
  useUiStore.getState().setInsertOverlay(ov ? { start: ov.start, current: ov.current } : null);
}, [insert.overlay]);
```

- [ ] **Step 10.8: Update mouse-down dispatch — handle press → resize.start**

In `handleMouseDown` (line ~754, the `handleHit` block), replace:

```ts
if (handleHit) {
  const obj =
    handleHit.layer === 'structures'
      ? garden.structures.find((s) => s.id === handleHit.id)
      : garden.zones.find((z) => z.id === handleHit.id);
  if (obj) {
    resize.start(handleHit.handle, handleHit.id, handleHit.layer, obj, worldX, worldY);
    setActiveCursor(handleCursor(handleHit.handle));
  }
  return;
}
```

with:

```ts
if (handleHit) {
  const anchor = handlePositionToAnchor(handleHit.handle);
  if (handleHit.layer === 'structures') {
    structureResize.start(handleHit.id, anchor, worldX, worldY);
  } else {
    zoneResize.start(handleHit.id, anchor, worldX, worldY);
  }
  setActiveCursor(handleCursor(handleHit.handle));
  return;
}
```

- [ ] **Step 10.9: Update mouse-down dispatch — tool-active draw → insert.start**

Replace the existing `draw` branch (line ~729-733):

```ts
if (currentViewMode === 'draw' && plottingTool) {
  plot.start(worldX, worldY, e.altKey);
  setActiveCursor('crosshair');
  return;
}
```

with:

```ts
if (currentViewMode === 'draw' && plottingTool) {
  insert.start(worldX, worldY, {
    alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey,
  });
  setActiveCursor('crosshair');
  return;
}
```

- [ ] **Step 10.10: Update `handleMouseMove` dispatch**

Replace the `if (resize.move(e)) return;` and `if (plot.move(e)) return;` lines (around 893, 895) with kit dispatch. Inside the existing rect/worldX/worldY block:

```ts
if (rect) {
  const { panX: px, panY: py, zoom: z } = useUiStore.getState();
  const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, { panX: px, panY: py, zoom: z });
  const modifiers = { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey };

  if (structureResize.isResizing && structureResize.move(worldX, worldY, modifiers)) return;
  if (zoneResize.isResizing && zoneResize.move(worldX, worldY, modifiers)) return;
  if (insert.isInserting && insert.move(worldX, worldY, modifiers)) return;

  // existing area-select branch stays
  if (areaSelect.move(e)) return;

  const args = { worldX, worldY, clientX: e.clientX, clientY: e.clientY, modifiers };
  if (plantingMove.move(args)) return;
  if (zoneMove.move(args)) return;
  if (structureMove.move(args)) return;
}
```

(Drop the prior leading `if (resize.move(e)) return;` and `if (plot.move(e)) return;`.)

- [ ] **Step 10.11: Update `handleMouseUp` dispatch**

Replace the existing `resize.end()` and `plot.end()`/`plot.isPlotting` lines (around 978-989) with:

```ts
if (e.button === 0) {
  if (areaSelect.isDragging.current) {
    areaSelect.end();
    setActiveCursor(null);
    return;
  }
  if (insert.isInserting) {
    insert.end();
    setActiveCursor(null);
    return;
  }
  if (structureResize.isResizing) {
    structureResize.end();
    setActiveCursor(null);
    return;
  }
  if (zoneResize.isResizing) {
    zoneResize.end();
    setActiveCursor(null);
    return;
  }
  pan.end();
  plantingMove.end();
  zoneMove.end();
  structureMove.end();
  moveInteraction.end(e);
  setActiveCursor(null);
}
```

- [ ] **Step 10.12: Update Escape handler to cancel new hooks**

In the existing `handleEscape` effect (line ~268-281), add the new hooks:

```ts
function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    insert.cancel();
    structureResize.cancel();
    zoneResize.cancel();
    areaSelect.cancel();
    moveInteraction.cancel();
    plantingMove.cancel();
    zoneMove.cancel();
    structureMove.cancel();
    setActiveCursor(null);
  }
}
```

Drop the `plot.cancel()` line (the new flow is handled by `insert.cancel()`).

- [ ] **Step 10.13: Update useCallback dependency arrays**

`handleMouseDown`'s deps: drop `plot, resize`, add `insert, structureResize, zoneResize`.
`handleMouseMove`'s deps: drop `plot, resize`, add `insert, structureResize, zoneResize`.
`handleMouseUp`'s deps: same change.
The Escape effect's deps: drop `plot`, add `insert, structureResize, zoneResize`.

- [ ] **Step 10.14: Run full suite**

```
npm test -- --run
```
Expected: PASS. Renderer hasn't been touched yet — old direct-paint resize is broken visually but that's Task 11. Tests are not visual; they should still pass.

- [ ] **Step 10.15: Commit**

```
git add src/canvas/CanvasStack.tsx
git commit -m "refactor(garden): wire kit useResizeInteraction and useInsertInteraction in CanvasStack"
```

---

### Task 11: Renderer overlay paths

**Resize:** the legacy hook wrote a 35%-lerped pose into the gardenStore each frame, so existing `StructureLayerRenderer`/`ZoneLayerRenderer` already render the moving object correctly because the store updates drive re-render. The new kit hook does NOT mutate the store mid-gesture; it emits an overlay. So the renderer must hide the source object and draw at `overlay.currentPose` (which is the lerped 35%-each-frame pose, identical user-visible behavior).

**Insert:** the legacy `usePlotInteraction.move` painted directly to the selection canvas. The new flow paints from `useUiStore.insertOverlay` inside the existing `selectionCanvasRef` layer effect (which currently runs `systemRenderer.render`).

**Files:**
- Modify: `src/canvas/StructureLayerRenderer.ts`, `src/canvas/ZoneLayerRenderer.ts` (or wherever the hideIds + overlay hooks live; CanvasStack.tsx:425-449 shows the pattern).
- Modify: `src/canvas/CanvasStack.tsx` (subscribe to `resizeOverlay`/`insertOverlay`, push into renderers, paint dashed insert preview).

#### Commit 11a: resize overlay routes through structure/zone renderers

- [ ] **Step 11.1: Read existing renderer overlay convention**

The current pattern (CanvasStack.tsx:425-449) is:
- `xRenderer.hideIds = overlay?.layer === 'x' ? overlay.hideIds : [];`
- `xRenderer.overlayXs = overlay.objects` (move overlay)

For resize, we hide the same id and overlay one object whose pose is `currentPose`. We re-use `overlayStructures`/`overlayZones` arrays (already typed as `Structure[]`/`Zone[]`).

- [ ] **Step 11.2: In CanvasStack, after the existing dragOverlay→renderer plumbing block (line ~425), append:**

```ts
const resizeOverlayUi = useUiStore((s) => s.resizeOverlay);

if (resizeOverlayUi) {
  const id = resizeOverlayUi.id;
  const cp = resizeOverlayUi.currentPose;
  if (resizeOverlayUi.layer === 'structures') {
    const src = garden.structures.find((s) => s.id === id);
    if (src) {
      structureRenderer.current.hideIds = [id];
      structureRenderer.current.overlayStructures = [{ ...src, x: cp.x, y: cp.y, width: cp.width, height: cp.height }];
      structureRenderer.current.overlaySnapped = false;
    }
  } else {
    const src = garden.zones.find((z) => z.id === id);
    if (src) {
      zoneRenderer.current.hideIds = [id];
      zoneRenderer.current.overlayZones = [{ ...src, x: cp.x, y: cp.y, width: cp.width, height: cp.height }];
      zoneRenderer.current.overlaySnapped = false;
    }
  }
}
```

(This block runs every render. The earlier `dragOverlay` block already cleared hideIds/overlay arrays when no move overlay exists, so this only adds resize-specific overrides.)

- [ ] **Step 11.3: Add `resizeOverlayUi` to relevant `useLayerEffect` deps**

For both structure and zone canvas effects (lines ~451 and ~461), add `resizeOverlayUi` to the dependency array so they re-render every frame the lerp updates. Since `overlay` is already in the deps, just add `resizeOverlayUi` next to it.

- [ ] **Step 11.4: Manual smoke (skip in CI)**

Browser verify: drag a handle on a structure; the structure visibly resizes with the same lerp feel as before.

- [ ] **Step 11.5: Commit**

```
git add src/canvas/CanvasStack.tsx
git commit -m "feat(garden): route kit resize overlay into structure/zone renderers"
```

#### Commit 11b: insert overlay paints dashed preview

- [ ] **Step 11.6: Replace `selectionCanvasRef` layer-effect body**

In CanvasStack at the `selectionCanvasRef` `useLayerEffect` (line ~502), augment the render lambda so it paints insert preview alongside system overlay:

```ts
useLayerEffect(
  selectionCanvasRef,
  width, height, dpr,
  appMode === 'garden',
  (ctx) => {
    systemRenderer.current.render(ctx);
    const insertOv = useUiStore.getState().insertOverlay;
    const tool = useUiStore.getState().plottingTool;
    if (insertOv && tool) {
      const x = Math.min(insertOv.start.x, insertOv.current.x);
      const y = Math.min(insertOv.start.y, insertOv.current.y);
      const w = Math.abs(insertOv.current.x - insertOv.start.x);
      const h = Math.abs(insertOv.current.y - insertOv.start.y);
      const sx = panX + x * zoom;
      const sy = panY + y * zoom;
      const sw = w * zoom;
      const sh = h * zoom;
      ctx.fillStyle = `${tool.color ?? '#8B6914'}66`;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = tool.color ?? '#8B6914';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
    }
  },
  [appMode, selectedIds, garden.structures, garden.zones, garden.plantings, zoom, panX, panY, useUiStore((s) => s.insertOverlay)],
);
```

(The trailing `useUiStore((s) => s.insertOverlay)` in the dep list is a hook-call inside an array literal — that's not legal. Instead, hoist it: `const insertOverlayUi = useUiStore((s) => s.insertOverlay);` near the top of the component, then put `insertOverlayUi` in the dep list and read inside the lambda via `useUiStore.getState().insertOverlay` for the freshest value.)

Hoist near the existing `overlay` selector (line ~85):

```ts
const insertOverlayUi = useUiStore((s) => s.insertOverlay);
```

And use `insertOverlayUi` in the dep array.

- [ ] **Step 11.7: Manual smoke**

Switch to draw mode with a structure tool. Drag on the canvas. Dashed rect should appear and follow the cursor; release should commit the structure (already wired in Task 10).

- [ ] **Step 11.8: Run full suite**

```
npm test -- --run
```
Expected: PASS.

- [ ] **Step 11.9: Commit**

```
git add src/canvas/CanvasStack.tsx
git commit -m "feat(garden): paint insert preview from useUiStore.insertOverlay"
```

**Browser smoke checklist (do not block on this in plan; just include):**
- [ ] Drag a structure resize handle — resizes with snap.
- [ ] Drag a zone resize handle — resizes with snap.
- [ ] Hold alt during resize — bypasses snap.
- [ ] Sub-grid resize: object < cell on an axis — that axis doesn't snap.
- [ ] Insert structure (draw mode + structure tool + drag) — commits.
- [ ] Insert zone (draw mode + zone tool + drag) — commits.
- [ ] Escape during resize cancels (no commit, no checkpoint).
- [ ] Escape during insert cancels.
- [ ] Undo after resize commit restores prior dims.
- [ ] Undo after insert commit removes the inserted object.

---

### Task 12: Delete old hooks

**Files:**
- Delete: `src/canvas/hooks/useResizeInteraction.ts`
- Delete: `src/canvas/hooks/usePlotInteraction.ts`
- (Conditional) delete: `src/canvas/hooks/useResizeInteraction.test.ts`, `usePlotInteraction.test.ts` if they exist.
- Modify (if any remaining imports surface): `src/canvas/CanvasStack.tsx`

- [ ] **Step 12.1: Verify test files exist**

```
ls src/canvas/hooks/useResizeInteraction* src/canvas/hooks/usePlotInteraction*
```

- [ ] **Step 12.2: Grep for remaining imports**

Use Grep tool with pattern `useResizeInteraction|usePlotInteraction` and path `src/`. Expect zero matches outside the hooks directory itself (Task 10 dropped the CanvasStack imports).

If any non-test file still imports from `./hooks/useResizeInteraction` or `./hooks/usePlotInteraction`, fix it before deleting.

- [ ] **Step 12.3: Delete the files**

```
git rm src/canvas/hooks/useResizeInteraction.ts
git rm src/canvas/hooks/usePlotInteraction.ts
# If tests exist:
git rm src/canvas/hooks/useResizeInteraction.test.ts || true
git rm src/canvas/hooks/usePlotInteraction.test.ts || true
```

- [ ] **Step 12.4: Run full suite + build**

```
npm test -- --run
npm run build
```
Both expected: PASS.

- [ ] **Step 12.5: Commit**

```
git add -A src/canvas/hooks/
git commit -m "refactor(garden): delete legacy useResizeInteraction and usePlotInteraction"
```

---

### Task 13: Spec status flip + final smoke

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-canvas-kit-resize-insert-design.md`
- Modify (conditional): `docs/superpowers/specs/2026-04-30-canvas-kit-interactions-design.md` (if it tracks Phase 2 status)

- [ ] **Step 13.1: Update Phase 2 spec status line**

In `docs/superpowers/specs/2026-04-30-canvas-kit-resize-insert-design.md`, change line 3:

```markdown
**Status:** Phase 2 implemented in `docs/superpowers/plans/2026-04-30-canvas-kit-resize-and-insert.md`.
```

- [ ] **Step 13.2: Check whether Phase 1 spec needs update**

Read `docs/superpowers/specs/2026-04-30-canvas-kit-interactions-design.md` (the Phase 1 spec). If its status line lists Phase 2 as "pending" or "follow-on", update to point at this plan. If it doesn't track Phase 2, skip.

- [ ] **Step 13.3: Run full suite**

```
npm test -- --run
```
Expected: PASS, ~540 tests.

- [ ] **Step 13.4: Run build**

```
npm run build
```
Expected: PASS.

- [ ] **Step 13.5: Commit**

```
git add docs/superpowers/specs/
git commit -m "docs: mark canvas-kit resize+insert phase 2 implemented"
```

---

## Self-Review

### Spec coverage

- ✅ Task 0: Kit unit-free rename (`cellFt` → `cell`, `radiusFt` → `radius`).
- ✅ Task 1: `GestureBehavior<TPose, TProposed, TMoveResult>` + `MoveBehavior` / `ResizeBehavior` / `InsertBehavior` aliases + `ResizeAnchor` + `ResizePose` + overlays + `ResizeAdapter` + `InsertAdapter`.
- ✅ Task 2: File reorg into `move/`, `resize/`, `insert/`, `shared/`. Per-hook subpaths via top-level proxy files (`move.ts`, `resize.ts`, `insert.ts`).
- ✅ Task 3: `resize/clampMinSize` (anchor-aware, all 8 anchor combinations covered).
- ✅ Task 4: `resize/snapToGrid` (anchor-aware, `suspendBelowDim`, `bypassKey`).
- ✅ Task 5: `useResizeInteraction` (start, move with anchor-driven proposed pose, behaviors compose, lerp 35% in hook output, end emits TransformOp using targetPose, cancel, behavior onEnd Op[]/null overrides).
- ✅ Task 6: `zoneResizeAdapter` + `structureResizeAdapter`. checkpoint+undo verified.
- ✅ Task 7: `insert/snapToGrid` (onStart snaps origin, onMove snaps current, bypass).
- ✅ Task 8: `useInsertInteraction` (start, move, end with bounds = min(start,current) + abs(delta), abort on degenerate / commitInsert null / minBounds, cancel, behaviors compose).
- ✅ Task 9: `insertAdapter` reads `useUiStore.plottingTool`, dispatches structures/zones, returns null when no tool, applyBatch checkpoints garden store.
- ✅ Task 10: CanvasStack wires three new hooks; drops old `resize` / `plot` imports; adds `handlePositionToAnchor`; mouse-down/move/up/escape dispatch; mirrors overlays into uiStore.
- ✅ Task 11: Renderer paths — resize via existing `overlayStructures`/`overlayZones` arrays sourced from `useUiStore.resizeOverlay.currentPose`; insert via direct paint on selection canvas from `useUiStore.insertOverlay`.
- ✅ Task 12: Delete `useResizeInteraction.ts` and `usePlotInteraction.ts`.
- ✅ Task 13: Spec status flip + final build/test gate.
- ⏭️ Out of scope confirmed not implemented: aspect-ratio lock, rotation, multi-object resize, alignment guides, area-select port, clipboard port, drag-lab adoption, gardenStore migration to `createHistory`.

### Type consistency check

- `ResizeAnchor` defined once in `src/canvas-kit/interactions/types.ts`; re-exported via barrel; used in Tasks 1, 3, 4, 5, 10 with the exact same shape `{ x: 'min'|'max'|'free'; y: 'min'|'max'|'free' }`.
- `ResizePose` defined once; `ResizeBehavior<TPose extends ResizePose>` and `ResizeOverlay<TPose extends ResizePose>` consistently constrain it.
- `InsertProposed<TPose>` / `InsertOverlay<TPose>` / `InsertMoveResult<TPose>` consistently use `TPose extends { x: number; y: number }`.
- Adapter shapes `ResizeAdapter` and `InsertAdapter` defined once in `src/canvas-kit/adapters/types.ts`; consumed by Task 5/8 hooks and Task 6/9 garden adapters.
- `MoveBehavior<TPose>` alias resolves to the same shape Phase 1's interface had — Phase 1 tests stay green without modification (verified in Task 1.5 full-suite run).

### Placeholder scan

- No "TBD"/"see Task N"/"as appropriate" forms in the plan.
- Step 11.6 includes a self-correcting note about the dep-array hook-call mistake and shows the fixed form (`insertOverlayUi` hoisted via selector).
- Every task ends with at least one commit. Tasks 5, 8, 10, 11 split into multiple commits (5a/5b/5c, 8a/8b, 10a/10b, 11a/11b) per the style guide's guidance for sprawling tasks.
- Each TDD-shaped task starts with a failing test step, runs the failing test, then implements, then runs passing.

### Frequent commits

- Task 0: 1 commit (Step 0.7).
- Task 1: 1 commit (Step 1.6).
- Task 2: 1 commit (Step 2.10).
- Task 3: 1 commit (Step 3.5).
- Task 4: 1 commit (Step 4.6).
- Task 5: 3 commits (5.5, 5.10, 5.17).
- Task 6: 1 commit (Step 6.7).
- Task 7: 1 commit (Step 7.6).
- Task 8: 2 commits (8.5, 8.12).
- Task 9: 1 commit (Step 9.5).
- Task 10: 2 commits (10.3, 10.15).
- Task 11: 2 commits (11.5, 11.9).
- Task 12: 1 commit (Step 12.5).
- Task 13: 1 commit (Step 13.5).

Total: 19 commits across 14 tasks.
