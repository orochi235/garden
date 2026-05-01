# canvas-kit Interactions Design

**Status:** Draft
**Date:** 2026-04-30
**Authors:** Mike

## Goal

Generalize the remaining domain-coupled interaction modules (`useMoveInteraction`, `useResizeInteraction`, `usePlotInteraction`, `useAreaSelectInteraction`, `useClipboard`, `findSnapContainer`) into reusable, domain-agnostic primitives that live in `canvas-kit`. The kit becomes a complete editing framework — opinionated about gestures, transactions, and undo, but agnostic about what is being edited.

## Philosophy

The kit is omakase by design: it ships gesture protocols, op vocabulary, history, and behavior plugins. Consumers bring their own data model, renderers, and store. The kit does not own scene state — apps keep their existing stores and integrate via adapters.

The reference is Illustrator: the framework owns the editing experience; the consumer brings the document.

## Architecture

Three new layers atop the existing kit (grid math, drag primitives, viewport, render):

1. **Op + History.** Generic `Op<T>` interface with factory helpers (`createTransformOp`, `createReparentOp`, `createCreateOp`, `createDeleteOp`, `createSetSelectionOp`). Optional `createHistory(adapter)` Zustand-shaped store with `apply`, `applyBatch`, `undo`, `redo`. Apps with existing undo (e.g., the garden) ignore `createHistory` and route ops to their own machinery.

2. **SceneAdapter (per-hook narrow adapters).** Typed contracts the kit hooks consume. Apps provide one per hook by default; structurally typed so a wider object can satisfy multiple narrow interfaces.

3. **Interaction hooks with composable behaviors.** Each hook owns a gesture state machine and runs an array of behavior plugins at lifecycle points. Behaviors are small, testable functions that transform the proposed pose, set snap state, or override op emission.

## Op vocabulary

```ts
interface Op {
  apply(adapter: SceneAdapter): void;
  invert(): Op;
  label?: string;
  coalesceKey?: string;       // future: merge adjacent ops
}
```

Built-in factories (kit-shipped):

| Factory | Payload | apply / invert |
|---|---|---|
| `createTransformOp` | `{ id, from: TPose, to: TPose }` | `setPose(id, to)` / swap from/to |
| `createReparentOp` | `{ id, from: parentId\|null, to: parentId\|null }` | `setParent(id, to)` / swap |
| `createCreateOp` | `{ object: TObject }` | `insertObject(object)` / `createDeleteOp` |
| `createDeleteOp` | `{ object: TObject }` | `removeObject(id)` / `createCreateOp` |
| `createSetSelectionOp` | `{ from: string[], to: string[] }` | `setSelection(to)` / swap |

`TPose` is opaque to the kit. The app declares its pose shape per object type:
- Garden zones/structures: `{x, y, widthFt, heightFt}`
- Garden plantings: `{x, y}`
- Garden plot: `{widthFt, heightFt}`
- Drag-lab items: `{x, y, radiusFt}`
- Future rotated rect: `{x, y, widthFt, heightFt, rotationRad}`

`TransformOp` replaces the discrete Move and Resize ops. Move and resize are different gestures producing the same op shape with different parts of the pose changed.

Apps can author custom ops by implementing the `Op` interface directly — no special "custom" wrapper.

Multi-op gestures use `applyBatch(ops, label)`. A planting drag that re-parents emits `[TransformOp, ReparentOp]` as one batch. Undo replays inverses in reverse order.

## SceneAdapter

```ts
interface SceneAdapter<TObject, TPose> {
  // Pull (gesture-time queries)
  getObjects(): TObject[];
  getObject(id: string): TObject | undefined;
  getSelection(): string[];
  hitTest(worldX: number, worldY: number): string | null;
  getPose(id: string): TPose;
  getParent(id: string): string | null;

  // Mutators (called by op `apply` methods)
  setPose(id: string, pose: TPose): void;
  setParent(id: string, parentId: string | null): void;
  insertObject(object: TObject): void;
  removeObject(id: string): void;
  setSelection(ids: string[]): void;

  // Op submission (gesture commit point)
  applyBatch(ops: Op[], label: string): void;
}
```

Per-hook narrow adapter interfaces (`MoveAdapter`, `ResizeAdapter`, `ClipboardAdapter`, etc.) are subsets of `SceneAdapter`. `MoveAdapter` adds an optional `findSnapTarget(draggedId, x, y): SnapTarget | null` for container-snap support.

`findSnapContainer.ts` stays in `src/canvas/` as garden-specific code, exposed to the kit only via `plantingMoveAdapter.findSnapTarget`.

## Hook shape

```ts
function useMoveInteraction<TObject, TPose>(
  adapter: MoveAdapter<TObject, TPose>,
  options: UseMoveInteractionOptions<TPose>,
): {
  bind: (el: HTMLElement | null) => void;
  overlay: MoveOverlay<TPose> | null;
};
```

`MoveOverlay<TPose>` carries transient gesture state for the renderer:

```ts
interface MoveOverlay<TPose> {
  draggedIds: string[];
  poses: Map<string, TPose>;
  snapped: SnapTarget | null;
  hideIds: string[];
}
```

Renderers draw the moving objects at overlay poses; the normal scene render hides anything in `hideIds`.

### Gesture lifecycle (move)

1. `pointerdown` on a hit-test target → kit captures origin pose(s) via `adapter.getPose`. No overlay yet.
2. `pointermove` past `dragThresholdPx` → kit runs behaviors in array order, computes new pose(s), sets `overlay`. Renderer redraws.
3. Continued `pointermove` → overlay updates each frame; behaviors run each frame.
4. `pointerup`:
   - Behaviors' `onEnd` runs in array order. The first non-`undefined` return wins: ops mean "commit these instead of the default"; `null` means "abort the gesture, no batch, no history entry."
   - If every behavior returns `undefined`, the kit emits `[TransformOp]` per dragged id with the configured `moveLabel`. If a behavior set `snap` state, it is responsible for emitting any `ReparentOp` itself (typically `snapToContainer.onEnd` returns `[TransformOp, ReparentOp]`).
   - `adapter.applyBatch(ops, label)` is called; overlay clears.

## Behavior plugin shape

```ts
interface MoveBehavior<TPose> {
  onStart?: (ctx: GestureContext<TPose>) => void;
  onMove?: (
    ctx: GestureContext<TPose>,
    proposed: TPose,
  ) => { pose?: TPose; snap?: SnapTarget | null } | void;
  onEnd?: (ctx: GestureContext<TPose>) => Op[] | null | void;
}
```

Behaviors run in array order. Each may transform the pose, set snap state, or short-circuit op emission. The hook owns gesture state; behaviors are stateless functions that may use the context for scratch storage.

### Kit-shipped behaviors

| Behavior | Purpose |
|---|---|
| `snapToGrid({ cellFt, bypassKey?, snapXY })` | Round pose to grid; modifier suppresses |
| `snapToContainer({ dwellMs, findTarget, label? })` | Container snap state machine + dwell timer |
| `snapBackOrDelete({ radiusFt, onFreeRelease })` | Snap-back near origin; delete or commit otherwise |
| `axisLockWithModifier({ key })` | Constrain to dominant axis when modifier held |
| `clampToBounds({ getBounds })` | Clamp pose into parent's plantable bounds |

## Hook options (move example)

```ts
interface UseMoveInteractionOptions<TPose> {
  dragThresholdPx?: number;                // default 4
  groupDragSelection?: boolean;            // default true
  translatePose: (pose: TPose, dx: number, dy: number) => TPose;
  behaviors?: MoveBehavior<TPose>[];
  moveLabel?: string;                      // default 'Move'
  reparentLabel?: string;                  // default 'Move and reparent'
  onGestureStart?: (ids: string[]) => void;
  onGestureEnd?: (committed: boolean) => void;
}
```

`translatePose` is required (the kit can't translate opaque poses). Everything else has defaults.

### Garden planting move (example)

```ts
useMoveInteraction(plantingAdapter, {
  translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
  behaviors: [
    snapToGrid({ cellFt: garden.gridCellSizeFt }),
    snapToContainer({ dwellMs: 500, findTarget: findSnapContainer }),
    snapBackOrDelete({ radiusFt: garden.gridCellSizeFt, onFreeRelease: 'delete' }),
  ],
});
```

### Drag-lab (example)

```ts
useMoveInteraction(workspaceAdapter, {
  translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
  behaviors: [],
});
```

Other hooks follow the same pattern with their own behavior interfaces:
- `useResizeInteraction` — `ResizeBehavior`s like aspect-ratio lock, min-size clamp, snap-to-grid for handles.
- `useAreaSelectInteraction` — `AreaSelectBehavior`s for additive vs subtractive selection by modifier.
- `usePlotInteraction` — usually one behavior: `snapToGrid` for plot handles.
- `useClipboard` — no overlay; `copy/cut/paste` methods emit `CreateOp[]` / `DeleteOp[]` batches.

## Gesture handling

The kit handles **pointer gestures**; the app handles **keyboard shortcuts**. The boundary is:

- **App-side: keystroke → action.** `useKeyboardActionDispatch` (already in `src/actions/`) owns the single `window` `keydown` listener. Actions are declarative descriptors with `Shortcut` + `scope` + `execute`. Discrete keystrokes (cmd-Z, delete, escape, cmd-0) flow through this. The kit ships no shortcut system; an editing app brings its own.
- **Kit-side: pointer + modifiers → gesture.** Modifier-key state during a gesture (alt/shift/meta/ctrl) is sampled from the in-flight `PointerEvent` and exposed on `GestureContext.modifiers`. Behaviors read modifiers from the context — no subscription to keydown/keyup. Examples: `snapToGrid({ bypassKey: 'alt' })` checks `ctx.modifiers.alt`; `axisLockWithModifier({ key: 'shift' })` checks `ctx.modifiers.shift`.

**`GestureContext` shape (relevant fields):**

```ts
interface GestureContext<TPose> {
  draggedIds: string[];
  origin: Map<string, TPose>;        // poses captured at gesture start
  current: Map<string, TPose>;       // running pose (mutated by behaviors in onMove)
  snap: SnapTarget | null;
  modifiers: { alt: boolean; shift: boolean; meta: boolean; ctrl: boolean };
  pointer: { worldX: number; worldY: number; clientX: number; clientY: number };
  adapter: SceneAdapter<unknown, TPose>;
  // Scratch storage for behaviors. Stable across one gesture; reset on next gesture.
  scratch: Record<string, unknown>;
}
```

**Limitations:**

- Modifier changes that occur *without* a pointer event do not re-run behaviors. If the user starts a drag and then taps shift without moving the mouse, axis-lock will not engage until the next pointermove. Today's hooks have the same limitation. v1 preserves it; a future enhancement can add `keydown`/`keyup` listeners inside the hook to refresh `ctx.modifiers` and re-run `onMove` with the last pointer position.
- Pointer capture is set on `pointerdown` so a gesture continues to receive events when the cursor leaves the bound element. Hooks set capture; behaviors don't manage it.
- Right-click/context menus are not gesture-handled by the kit. Apps that need right-click drag (e.g., the garden's right-click pan) bind their own handlers; the kit's `bind` only wires left-button gestures.

## File layout

### Kit

```
src/canvas-kit/
  ops/
    types.ts                # Op, applyBatch contract
    transform.ts            # createTransformOp
    reparent.ts             # createReparentOp
    create.ts               # createCreateOp
    delete.ts               # createDeleteOp
    selection.ts            # createSetSelectionOp
    index.ts
  history/
    history.ts              # createHistory (optional opt-in store)
    index.ts
  adapters/
    types.ts                # SceneAdapter, MoveAdapter, ResizeAdapter, ...
  interactions/
    move.ts                 # useMoveInteraction
    resize.ts               # useResizeInteraction
    plot.ts                 # usePlotInteraction
    areaSelect.ts           # useAreaSelectInteraction
    clipboard.ts            # useClipboard
    types.ts                # MoveBehavior, ResizeBehavior, GestureContext, SnapTarget
    behaviors/
      snapToGrid.ts
      snapToContainer.ts
      snapBackOrDelete.ts
      axisLockWithModifier.ts
      clampToBounds.ts
      index.ts
```

### App-side adapters (garden)

```
src/canvas/adapters/
  plantingMove.ts            # plantingMoveAdapter
  zoneMove.ts
  structureMove.ts
  zoneResize.ts
  structureResize.ts
  plotResize.ts
  areaSelect.ts
  clipboard.ts
```

Adapters are small (~30–60 lines) and domain-specific. They live in `src/canvas/` because they translate kit calls to `useGardenStore` / `useUiStore`.

## Migration order

1. **Op + history infrastructure.** No consumers yet. Tests cover apply/invert correctness, history apply/undo/redo, batch atomicity.
2. **`useMoveInteraction` + `MoveBehavior` types + behavior implementations.** Unit tests per behavior in isolation; integration tests covering today's `useMoveInteraction.test.ts` scenarios retargeted.
3. **Wire `gardenStore.checkpoint()` into `applyBatch`** for the move adapter so kit-driven mutations push undo entries the same way today's hand-rolled mutations do.
4. **Replace remaining hooks one at a time.** Order: resize, plot, area-select, clipboard. Each hook gets an adapter, a CanvasStack call-site change, and the old hook deletion.
5. **Delete `src/canvas/hooks/`** once empty.
6. **Drag-lab adoption.** Replace `CanvasRenderer.tsx`'s hand-rolled pointer code with `useMoveInteraction` (no behaviors). Strategy tests below the hook layer continue to pass.

`gardenStore`'s existing history is preserved. The kit's `createHistory` is opt-in for new apps; the garden does not migrate.

## Testing strategy

- **Op factories:** pure unit tests; `apply(invert(op))` returns adapter to baseline.
- **History:** fake adapter records mutator calls; apply/undo/redo sequences verified call-by-call. Batches atomic.
- **Behaviors:** pure unit tests with a mock `GestureContext`. `snapToGrid` rounds; `snapToContainer` dwells (vitest fake timers); `snapBackOrDelete` returns `null`/`[DeleteOp]`/`undefined` per radius and policy.
- **Hooks:** simulated pointer events against a fake adapter that records `applyBatch` calls. Existing scenarios retargeted: free-agent snap-back produces no batch; free-agent delete produces `[DeleteOp]`; snap-to-new-container produces `[TransformOp, ReparentOp]`; threshold blocks taps; multi-select drag emits one batch with one TransformOp per id.
- **Garden integration:** existing test suites (`useMoveInteraction.test.ts`, `useClipboard.test.ts`, etc.) continue to pass against the new code paths.
- **Drag-lab integration:** drag-lab's renderer migrates to `useMoveInteraction` with no behaviors. Acts as the natural second-consumer smoke test.

## Risks

- **Hidden coupling in current `useMoveInteraction`** (~470 lines). Mitigation: read end-to-end before fixing the adapter interface; surface domain-shaped logic as a behavior plugin or option, not a kit branch.
- **`gardenStore.checkpoint()` semantics.** Today checkpoint runs *before* a mutation; the kit emits ops *after* the gesture. The garden's `applyBatch` adapter wraps the work in `checkpoint(() => ops.forEach(apply))`. Existing snapshot semantics survive.
- **Re-render thrash.** Hooks return overlay state that changes every pointermove; CanvasStack already redraws every frame. Adapters must read stores via `getState()` at gesture-time only — not subscribe inside the hook.
- **Pose math edge cases.** Resize from non-anchor corners, group resize, rotated objects. Mitigation: v1 ships axis-aligned only; rotation/free-transform deferred.
- **Adapter API churn.** Six hooks × multiple methods is a wide surface. Mitigation: per-hook narrow adapter types added as needed.

## Out of scope

- Op coalescing implementation (mark `coalesceKey` field but defer logic).
- Networked collaboration / CRDTs.
- Full affine transforms (rotation, skew). The op shape supports them; behaviors and adapters do not.
- Migrating `gardenStore` history to `createHistory`. Both history systems coexist; the kit's history is for new apps.
