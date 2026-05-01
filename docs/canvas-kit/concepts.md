# Core concepts

## Adapter pattern

The kit never reads or writes domain state directly. Instead, every hook takes
an **adapter** — a small interface the consumer implements to expose its scene
graph. Hook-specific adapters (`MoveAdapter`, `ResizeAdapter`, `InsertAdapter`,
`AreaSelectAdapter`) are narrow subsets of `SceneAdapter`. TypeScript's
structural typing means a single broad adapter satisfies any narrow interface,
so most apps write one adapter per scene and pass it to every hook.

The adapter is the only place domain-specific logic lives. The kit calls
`getPose`, `setPose`, `applyBatch`, etc.; the adapter decides what those mean
(immutable redux update, mutable mobx model, in-place mutation, …).

Defined in `src/canvas-kit/adapters/types.ts`. See [adapters.md](./adapters.md).

## Ops and history

An **op** is an invertible mutation:

```ts
interface Op {
  apply(adapter: unknown): void;
  invert(): Op;
  label?: string;
  coalesceKey?: string;
}
```

Every interaction commits a batch of ops at gesture end. Adapters with
op-based history call `history.applyBatch(ops, label)` to push an undoable
entry; adapters with snapshot-based history (e.g. `src/store/history.ts` in
this repo, which clones the whole `Garden` per entry) just apply each op's
mutation against the current state and push their own entry alongside.

Op constructors live under `src/canvas-kit/ops/`: `createTransformOp`,
`createReparentOp`, `createInsertOp`, `createDeleteOp`, `createSetSelectionOp`.
Each `apply` casts the adapter to the narrow interface it needs (e.g.
transform calls `setPose`), so the same op type works against any compatible
adapter.

Transient gestures (area-select, marquee) commit via `applyOps(ops)` instead
of `applyBatch(ops, label)` — they want the selection change but no history
entry. See "defaultTransient" below.

## Gesture lifecycle

Every interaction hook follows the same shape:

1. **start(...)** — adapter snapshots origin pose(s) into a `GestureContext`.
   Hook enters `pending` (move) or `active` (resize/insert/area-select).
2. **move(...)** — fires per pointer event. Once past `dragThresholdPx`, the
   hook flips to `active`, fires `onStart` on each behavior, and computes a
   **proposed pose** from raw delta. Each behavior's `onMove(ctx, proposed)`
   may return a refined pose and/or snap target. The final pose flows into
   the overlay state for renderers.
3. **end()** — behaviors run `onEnd(ctx)`; the first non-`undefined` return
   wins:
   - `Op[]` → those ops are committed.
   - `null` → abort silently.
   - `undefined` → fall through to the hook's default ops (e.g. move emits a
     `createTransformOp` per dragged id).
4. **cancel()** — wipes overlay, no ops.

The proposed-pose pipeline is the central abstraction: behaviors are pure-ish
transformers `(ctx, proposed) → refinedProposed`, chained in registration
order. See `src/canvas-kit/interactions/move/move.ts` for the canonical
implementation.

## Behaviors

A behavior implements `GestureBehavior<TPose, TProposed, TMoveResult>`:

```ts
interface GestureBehavior<TPose, TProposed, TMoveResult> {
  defaultTransient?: boolean;
  onStart?(ctx: GestureContext<TPose>): void;
  onMove?(ctx: GestureContext<TPose>, proposed: TProposed): TMoveResult | void;
  onEnd?(ctx: GestureContext<TPose>): Op[] | null | void;
}
```

Each hook pins `TProposed` and `TMoveResult` (e.g. move's `TMoveResult` is
`{ pose?: TPose; snap?: SnapTarget<TPose> | null }`). Behaviors are passed in
via `options.behaviors` and run in array order; later behaviors see refinements
from earlier ones via the updated `proposed`.

**Scratch space.** `ctx.scratch` is a per-gesture `Record<string, unknown>`
that resets on every `start`. Use it for state that needs to persist across
move events but die at end (e.g. `snapToContainer` stores a dwell timer and
committed snap there). Namespace keys by behavior id to avoid collisions:
`ctx.scratch['snapToContainer']`.

**defaultTransient.** When at least one behavior in a gesture sets this true
(and `options.transient` isn't explicitly set), the hook commits via
`adapter.applyOps(ops)` — ops apply but no history entry is created.
`selectFromMarquee` is the canonical example; selection state changes don't
clutter undo. Currently honored by `useAreaSelectInteraction`; clone behaviors
respect it via the kit's clone hook.

## Overlays

Each interaction hook returns an `overlay` field — the live state of the
in-flight gesture, suitable for rendering on top of the static scene.

| Hook | Overlay shape |
|------|---------------|
| `useMoveInteraction` | `{ draggedIds, poses, snapped, hideIds }` |
| `useResizeInteraction` | `{ id, currentPose, targetPose, anchor }` |
| `useInsertInteraction` | `{ start, current }` |
| `useAreaSelectInteraction` | `{ start, current, shiftHeld }` |
| `useCloneInteraction` | published via `setOverlay(layer, objects)` callback |

Renderers read the overlay every frame and draw the dragged objects with the
proposed pose, hiding their originals (`hideIds` for move). Resize lerps
`currentPose` toward `targetPose` for visual smoothing — the lerp is internal
to the hook.

## Modifier and pointer state

`ModifierState = { alt, shift, meta, ctrl }` is captured at every move event
and stored on `ctx.modifiers`. `PointerState = { worldX, worldY, clientX,
clientY }` captures the latest pointer position in both world and client
coordinates. Behaviors read both off `ctx` to react to keys (e.g.
`bypassKey: 'shift'` for snap, `mods.alt` for clone activation).
