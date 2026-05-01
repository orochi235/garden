# canvas-kit Resize + Insert Design (Phase 2)

**Status:** Implemented in `docs/superpowers/plans/2026-04-30-canvas-kit-resize-and-insert.md`.
**Date:** 2026-04-30
**Authors:** Mike
**Predecessor:** `docs/superpowers/specs/2026-04-30-canvas-kit-interactions-design.md` (Phase 1 implemented in `docs/superpowers/plans/2026-04-30-canvas-kit-foundation-and-move.md`)

## Goal

Port `useResizeInteraction` and `usePlotInteraction` (renamed `useInsertInteraction`) from `src/canvas/hooks/` into the canvas-kit framework as siblings to Phase 1's `useMoveInteraction`. Both gestures emit ops via the existing adapter/history pipeline; both expose overlay state for renderer-driven previews.

## Non-goals

- Area-select and clipboard ports (Phase 3).
- Drag-lab adoption (Phase 4 — first real `createHistory` consumer).
- Aspect-ratio lock, rotation, free transform.
- Multi-object (group) resize. Single-object only, matching today.

## Architecture summary

Two new hooks (`useResizeInteraction`, `useInsertInteraction`) parallel to `useMoveInteraction`, sharing infrastructure:

- **`GestureBehavior<TPose, TProposed>`** — generalized base behavior interface in `interactions/types.ts`. `MoveBehavior`, `ResizeBehavior`, `InsertBehavior` become aliases parameterized by the proposed-pose shape per hook.
- **`ResizeAnchor = { x: 'min'|'max'|'free'; y: 'min'|'max'|'free' }`** — domain-agnostic descriptor. Garden translates `HandlePosition` (n/s/e/w/...) to anchor before calling the kit.
- **Per-hook subpath barrels** (`@/canvas-kit/move`, `/resize`, `/insert`) so three `snapToGrid` behaviors with different return types coexist without name collision in the top-level barrel.
- **Kit unit-free rename** (`cellFt`→`cell`, `radiusFt`→`radius`) bundled as Task 0. Garden-side fields keep their feet suffixes; the seam is at the kit boundary.

The kit stays render-agnostic: lerp animation moves to the renderer (overlay carries `currentPose` and `targetPose`); insert preview moves from direct canvas paint to overlay-driven paint.

## Generalizing the behavior interface

Phase 1's `MoveBehavior<TPose>` becomes a special case of:

```ts
interface GestureBehavior<TPose, TProposed> {
  onStart?(ctx: GestureContext<TObject, TPose>): void;
  onMove?(
    ctx: GestureContext<TObject, TPose>,
    proposed: TProposed,
  ): { /* per-hook fields */ } | void;
  onEnd?(ctx: GestureContext<TObject, TPose>): Op[] | null | void;
}

type MoveBehavior<TPose>   = GestureBehavior<TPose, TPose>;
type ResizeBehavior<TPose> = GestureBehavior<TPose, { pose: TPose; anchor: ResizeAnchor }>;
type InsertBehavior<TPose> = GestureBehavior<TPose, { start: TPose; current: TPose }>;
```

`MoveBehavior` keeps its current shape; existing Phase 1 behaviors and tests are unchanged. The generalization is internal type plumbing.

`onMove` return shapes diverge per hook:
- Move: `{ pose?: TPose; snap?: SnapTarget | null }` (existing)
- Resize: `{ pose?: TPose }` (snap-target concept doesn't apply; resize doesn't reparent)
- Insert: `{ current?: TPose; start?: TPose }` (start is settable in `onStart`)

## Hook contracts

### `useResizeInteraction`

```ts
interface ResizePose { x: number; y: number; width: number; height: number }
type ResizeAnchor = { x: 'min'|'max'|'free'; y: 'min'|'max'|'free' };

interface ResizeAdapter<TObject extends { id: string }, TPose extends ResizePose> {
  getObject(id: string): TObject | undefined;
  getPose(id: string): TPose;
  setPose(id: string, pose: TPose): void;
  applyBatch(ops: Op[], label: string): void;
}

interface ResizeOverlay<TPose> {
  id: string;
  currentPose: TPose;     // renderer draws this now; lerps toward targetPose
  targetPose: TPose;      // snapped/clamped destination
  anchor: ResizeAnchor;
}

interface UseResizeInteractionOptions<TPose extends ResizePose> {
  behaviors?: ResizeBehavior<TPose>[];
  resizeLabel?: string;   // default 'Resize'
  onGestureStart?: (id: string) => void;
  onGestureEnd?: (committed: boolean) => void;
}

useResizeInteraction(adapter, options): {
  start(id: string, anchor: ResizeAnchor, worldX: number, worldY: number): void;
  move(worldX: number, worldY: number, modifiers: ModifierState): boolean;
  end(): void;
  cancel(): void;
  overlay: ResizeOverlay<TPose> | null;
  isResizing: boolean;
}
```

Behavior `onMove` proposed: `{ pose: TPose; anchor: ResizeAnchor }`. Behaviors mutate `pose` only on the edges the anchor identifies as moving (`min` or `max`); `free` axes are untouched.

The hook does not own resize-handle hit-testing — the consumer detects the handle press and calls `start` with an anchor.

### `useInsertInteraction`

```ts
interface InsertBounds { x: number; y: number; width: number; height: number }

interface InsertAdapter<TObject extends { id: string }> {
  commitInsert(bounds: InsertBounds): TObject | null;   // null = abort (e.g., no active tool)
  applyBatch(ops: Op[], label: string): void;
}

interface InsertOverlay<TPose extends { x: number; y: number }> {
  start: TPose;
  current: TPose;
  // app reads its own tool state for color/label; kit stays tool-agnostic
}

interface UseInsertInteractionOptions<TPose extends { x: number; y: number }> {
  behaviors?: InsertBehavior<TPose>[];
  insertLabel?: string;                                 // default 'Insert'
  minBounds?: { width: number; height: number };       // commit aborts if below; default { width: 0, height: 0 } strict positive
  onGestureStart?: () => void;
  onGestureEnd?: (committed: boolean) => void;
}

useInsertInteraction(adapter, options): {
  start(worldX: number, worldY: number, modifiers: ModifierState): void;
  move(worldX: number, worldY: number, modifiers: ModifierState): boolean;
  end(): void;
  cancel(): void;
  overlay: InsertOverlay<TPose> | null;
  isInserting: boolean;
}
```

Behavior `onMove` proposed: `{ start: TPose; current: TPose }`. Behaviors return `{ current?: TPose; start?: TPose }` to override either endpoint.

On `end()`, the kit:
1. Computes bounds from `start` and `current`.
2. If `width <= minBounds.width` or `height <= minBounds.height`, aborts (no batch, no history entry).
3. Otherwise calls `adapter.commitInsert(bounds)`. Null return aborts.
4. Emits `[createCreateOp({ object })]` via `applyBatch`.

## Kit-shipped behaviors

| Hook | Behavior | Purpose |
|---|---|---|
| move | `snapToGrid({ cell, bypassKey? })` | unchanged from Phase 1 (post unit-free rename) |
| move | `snapToContainer({ dwellMs, findTarget })` | unchanged |
| move | `snapBackOrDelete({ radius, onFreeRelease })` | unchanged (post rename) |
| resize | `snapToGrid({ cell, bypassKey?, suspendBelowDim? })` | anchor-aware; `suspendBelowDim` (default true) skips snap on an axis when current dimension < cell |
| resize | `clampMinSize({ minWidth, minHeight })` | non-bypassable. When an edge would push a dimension below min, the dragged edge stops at the limit; the anchor stays put |
| insert | `snapToGrid({ cell, bypassKey? })` | snaps `start` once at gesture start (via `onStart`) and `current` each `onMove` |

All three `snapToGrid` factories internally delegate to `gridSnapStrategy(cell)` from Phase 1's `SnapStrategy` infrastructure. The strategy returns the rounded x/y; each behavior wraps it in the right proposed-pose shape.

## File layout

### Kit reorganization

Phase 1's flat `interactions/behaviors/` is split per hook:

```
src/canvas-kit/interactions/
  types.ts                         # GestureBehavior<TPose,TProposed>, GestureContext,
                                   # MoveBehavior, ResizeBehavior, InsertBehavior aliases,
                                   # ResizeAnchor, SnapStrategy
  shared/
    snap.ts                        # generic snap(strategy, opts)
    strategies/
      grid.ts                      # gridSnapStrategy(cell)
      index.ts
    index.ts
  move/
    move.ts                        # useMoveInteraction (moved from interactions/move.ts)
    behaviors/
      snapToGrid.ts
      snapToContainer.ts
      snapBackOrDelete.ts
      index.ts
    index.ts
  resize/
    resize.ts
    behaviors/
      snapToGrid.ts                # anchor-aware
      clampMinSize.ts
      index.ts
    index.ts
  insert/
    insert.ts
    behaviors/
      snapToGrid.ts
      index.ts
    index.ts
  index.ts                         # re-exports hooks + types; NOT the snapToGrid behaviors
```

**Top-level `@/canvas-kit` exports:** hooks (`useMoveInteraction`, `useResizeInteraction`, `useInsertInteraction`), all types, ops, history, grid math (`roundToCell`, `worldToScreen`, `screenToWorld`), snap-strategy primitives (`snap`, `gridSnapStrategy`). The `snapToGrid` behaviors must be imported from `@/canvas-kit/move` / `/resize` / `/insert`.

### Garden adapters (new)

```
src/canvas/adapters/
  zoneResize.ts                    # ResizeAdapter<Zone, ZonePose>
  structureResize.ts               # ResizeAdapter<Structure, StructurePose>
  insert.ts                        # InsertAdapter dispatching by plottingTool.category
```

Adapters mirror Phase 1's `zoneMove`/`structureMove` shape: `applyBatch` calls `useGardenStore.getState().checkpoint()` before invoking ops; ops call back through the adapter's public mutators. `insertAdapter.commitInsert` reads `useUiStore.getState().plottingTool` and constructs a `Structure` or `Zone` object accordingly; returns `null` when no tool is active.

## Renderer changes

- **Resize:** new `resizeOverlay` reader on `useUiStore` (mirrored from hook overlay in CanvasStack). Renderer lerps `currentPose → targetPose` per frame at `LERP=0.35` (constant from current code). The source object is hidden during gesture (the overlay is the truth).
- **Insert:** old direct-paint code in `usePlotInteraction.move` is deleted. New `insertOverlay` reader paints the dashed preview rect on the selection canvas using overlay's `start`/`current` and the active tool's color (read from `useUiStore.plottingTool` at paint time).

## CanvasStack migration

```tsx
const resize = useResizeInteraction(activeResizeAdapter, {
  behaviors: [
    resizeSnapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' }),
    clampMinSize({ minWidth: 0.25, minHeight: 0.25 }),
  ],
});

const insert = useInsertInteraction(insertAdapter, {
  behaviors: [insertSnapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' })],
  minBounds: { width: 0.01, height: 0.01 },
});
```

`activeResizeAdapter` is selected by hit-tested layer — `zoneResizeAdapter` for zones, `structureResizeAdapter` for structures. CanvasStack's mouse-down dispatcher routes handle hits to `resize.start(id, handlePositionToAnchor(handle), worldX, worldY)` and tool-active canvas hits to `insert.start(worldX, worldY, modifiers)`. Mouse-move dispatches to whichever gesture is active. Both overlays mirror to `useUiStore` analogous to Phase 1's `dragOverlay`. The old `useResizeInteraction` / `usePlotInteraction` imports are dropped from CanvasStack.

## Migration order (within this phase)

0. Kit unit-free rename (`cellFt`→`cell`, `radiusFt`→`radius`).
1. Generalize `MoveBehavior` → `GestureBehavior<TPose, TProposed>`; add `ResizeBehavior` / `InsertBehavior` / `ResizeAnchor` / `ResizeOverlay` / `InsertOverlay` types.
2. File reorg: split `interactions/behaviors/` into `move/`, `resize/`, `insert/`, `shared/`.
3. `resize/clampMinSize` behavior + tests.
4. `resize/snapToGrid` behavior (anchor-aware, sub-grid suspend) + tests.
5. `useResizeInteraction` hook + integration tests.
6. `zoneResizeAdapter` + `structureResizeAdapter` + tests.
7. `insert/snapToGrid` behavior + tests.
8. `useInsertInteraction` hook + integration tests.
9. `insertAdapter` + tests.
10. CanvasStack migration: resize and insert wired; old hook imports dropped from CanvasStack.
11. Renderer overlay reads: resize lerp; insert preview painted from overlay state.
12. Delete `src/canvas/hooks/useResizeInteraction.ts`, `usePlotInteraction.ts`. Their tests retargeted or removed.
13. Smoke test + flip spec status to "Phase 2 implemented"; update `docs/behavior.md` only if user-visible behavior diverged.

## Testing strategy

**Behavior unit tests** (mock `GestureContext`):
- `resize/snapToGrid.test.ts` — anchor=min snaps low edge; anchor=max snaps high edge; anchor=free leaves axis untouched; `suspendBelowDim` skips snap when `current dim < cell`; bypass modifier skips entirely; corner handle snaps both axes.
- `resize/clampMinSize.test.ts` — anchor=min stops dragged edge at limit and freezes anchor; anchor=max same; both axes independent.
- `insert/snapToGrid.test.ts` — snaps `start` once (in `onStart`); snaps `current` each `onMove`; bypass modifier skips both.

**Hook integration tests** (simulated pointer events, fake adapter records `applyBatch`):
- `useResizeInteraction.test.ts` — start → move → end emits one `[TransformOp]` with correct `from`/`to`; behaviors compose in order; cancel produces no batch; sub-grid suspension end-to-end; min-clamp end-to-end.
- `useInsertInteraction.test.ts` — degenerate bounds abort with no batch; commit emits `[CreateOp({ object })]`; `commitInsert` returning null aborts; cancel produces no batch.

**Garden integration**:
- `zoneResize.test.ts` / `structureResize.test.ts` — adapter wrappers thread checkpoint correctly; `getObject` round-trips.
- `insert.test.ts` — `commitInsert` chooses zone vs structure by `plottingTool.category`; returns null when no tool active.

**Manual smoke** after CanvasStack migration: drag handle resize, sub-grid resize, alt-bypass, insert structures and zones, escape during gesture.

**Targets:** ~25-30 new tests. Final count ~540.

## Risks

- **Resize state machine coupling.** Current code is ~120 lines (vs Phase 1 move's ~470). Lower risk than Phase 1.
- **Insert preview canvas refactor.** The selection canvas is shared with area-select preview today (Phase 3). Keep insert paint distinct so area-select layers in cleanly later.
- **Lerp moved to renderer** means snapshot-style assertions of "object pose during gesture" no longer reflect on-screen position. Mitigation: tests assert overlay `targetPose`, not visual lerp.
- **Generalizing `MoveBehavior` → `GestureBehavior`** is an internal-type change. The alias preserves call-site compatibility; watch for any external import of the type.
- **Per-hook subpath imports** are a new convention. Document in the kit's top-level `index.ts` JSDoc.

## Out of scope

- Aspect-ratio lock during resize (`shift` to constrain).
- Insert-with-snap-to-existing-edges (alignment guides) — slot for future `SnapStrategy` work.
- Multi-object group resize.
- Rotated rects / affine transforms.
- Migrating `gardenStore` history to `createHistory`.
