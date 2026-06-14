# Follow-up SP — adopt weasel HEAD's declarative Action API in eric's gesture layer

> **Status:** deferred (not part of the SP2–SP4 coupled cutover). Created 2026-06-13 when the cutover
> chose to **vendor** the removed gesture controllers rather than adopt HEAD's Action API, to reach
> green fast at low parity risk. This doc captures the deferred work so the vision isn't lost.

## Why this exists

The SP2–SP4 cutover's stated end-state was "eric runs on HEAD using the declarative Action API
throughout; the hand-rolled dragPreview/putative-drag subsystem is deleted where the kit owns it."

Mid-cutover we discovered eric does **not** use HEAD's `SceneCanvas`/`useGestureDispatcher`. It has its
own `defineTool`/`ToolCtx` framework and drove weasel's now-removed `useMove`/`useResize`/`useClone`/
`useAreaSelect` **imperatively**. Reaching green via the Action API would have meant either constructing
`InvocationCtx`+dep-registry by hand or replacing eric's whole tool framework — both larger and riskier
than the cutover budget. So the cutover **vendored** the 4 controllers into `src/canvas/gestures/`
(see the mapping spec, Surface 4). Eric now runs on HEAD but keeps its own gesture math.

This SP migrates eric's gesture layer onto HEAD's Action API properly, then deletes the vendored code
and the bespoke drag subsystem.

## Scope

1. **Drive HEAD Action invokers from eric's tool** (or adopt `useGestureDispatcher`). For each vendored
   controller, replace it with the matching HEAD descriptor driven through its `OngoingInvoker`:
   - `useMove` → `moveAction.invoker.start(ctx)` → `OngoingHandle.onMove/onEnd`.
   - `useResize` → `resizeAction` + `resizePolicy` dep (behaviors→`constraints`, geometry→`projection`,
     `expandIds` for the union-AABB group path). Reads `ctx.drag.affordance` (`handle:*`).
   - `useAreaSelect` → `areaSelectAction` (selection write moves into the action; `selectFromMarquee`
     behavior is gone).
   - `useClone` → `cloneAction` with the alt-gate as a dispatcher **binding** concern (HEAD Phase 12),
     `previewHidesSource:false`.
   Build the `InvocationCtx` + deps (`selection`, `scene`, `view`, `pointer`, `resizePolicy`,
   `areaSelect`, `insert`, `activeTool`) — via `DepRegistryProvider`/`useDepSource` or a thin imperative shim.

2. **Port behaviors to HEAD's `MoveBehavior` signature.** `onMove(GestureContext, proposed: GroupTransform)
   → { transform?: GroupTransform, snap? }` — was `onMove(ctx, proposedPose) → { pose }`. Affects
   `structureMoveBehaviors.ts` (`clampStructureZoneToGardenBounds`, `detectStructureClash` — union-AABB
   over `ctx.origin.get(id)+delta`), `snapMoveBehaviors.ts`, and `trackPlantingSnap`.

3. **Rewire preview to the dispatcher ghost layer.** Replace eric's `move.overlay`→`uiStore.dragPreview`
   mirror effects with `OngoingHandle.previewIds()/previewPose(id)` + `usePreviewGhostLayer`; marquee via
   `overlay()`→`useDispatcherOverlayLayer`. Map the bespoke cell-grid planting-ghost snap onto
   `LayoutStrategy.getDropTargets` + `overlay()` custom commands (the riskiest visual-parity area).

4. **Delete the vendored gesture module** (`src/canvas/gestures/`) and the superseded bespoke drag code
   (`canvas/drag/{areaSelectDrag,seedFillTrayDrag,seedlingMoveDrag,dragGhost,moveDrag,resizeDrag,...}`,
   `dragPreviewLayer`, `putativeDrag`, `uiStore.dragPreview`). This is the H4 teardown the cutover left
   in place.

## Gate

Visual-parity suite (`npm run test:visual`) is the primary gate — garden + nursery move/resize/clone/
area-select/planting-snap/clash must match baselines. Extend the suite for any bespoke behavior (clash
tint, snap ghost) not yet covered before relying on it.
