# Phase 7 — step 3 handoff (dispatcher adoption + delete the gesture pile)

Branch `phase7-kit-gesture-adoption`. **Steps 1–2 are committed and green** (tsc clean,
831 unit tests, visual **5/5**). This doc is the spec for the remaining work. Parent plan:
`2026-06-15-phase7-kit-gesture-adoption.md`.

## State / what's done
- **Weasel (rebuilt dist):** behavior pipeline wired into `moveAction` (`move.behaviors`);
  layout-reflow shipped (`SceneCanvas` `layouts` prop, `deps/layout.ts`, move folds sibling
  poses into the preview channel + commits via `commitDrop`); group taxonomy reworked —
  **group = `ContainerNode`**, **selection = transient id set**, membership `Group`/`GroupAdapter`
  REMOVED; `LayoutStrategy.getChildPositions→childPoses`, `reflowFor→reflowPoses`.
  → eric must never wire its `groupId` into a kit container-"group"; it's `expandIds` (selection).
- **Step 1 (committed `bbf6ced`):** `src/canvas/layers/gardenDrawOne.ts` — per-node world-space
  body painter (zone/structure/planting). `plantingLayout.ts` + vendored `gestures/move.ts`
  renamed to childPoses/reflowPoses.
- **Step 2 (committed `865fcc1`):** scene slot wired to `createGardenDrawOne`; body sub-layers
  removed; structure group-compound rendering deleted (**decision B**: grouped structures =
  individual bodies + existing `createGroupOutlineLayer`). Added `garden-grouped` visual fixture.

## Two carryover fixes (must handle in step 3)
1. **`drawOne` must honor the kit pose for GHOSTS.** Step 2's bridge has `drawOne` read the
   store WORLD pose via `adapter.getNode/getPose` and *ignore* the kit pose (correct for committed
   render → pixel-identical). But the kit ghost layer (`usePreviewGhostLayer`) calls `drawOne` with
   the PREVIEW pose; ignoring it renders ghosts at committed positions. Fix: when the kit pose is a
   live drag pose, convert it (planting pose is parent-LOCAL → world) and draw at it.
2. **Clash highlight re-home.** `dragClashIds` red ring lived in the deleted `structure-highlights`
   layer. `detectStructureClash` still sets `uiStore.dragClashIds`; add a small `structure-clash`
   RenderLayer drawing the red ring from that signal.

## Step 3 work
1. Make `drawOne` ghost-correct (carryover #1).
2. `CanvasNewPrototype.tsx`: `enableGestureDispatcher={true}`; pass
   `selectTool={{ move: { behaviors:[snapStructureZoneToGrid, clampStructureZoneToGardenBounds,
   detectStructureClash, trackPlantingSnap, requirePlantingDrop], expandIds: ids =>
   expandToGroups(ids, structures), cascadeWorldPose }, resize:{behaviors:[...]}, areaSelect:{
   behaviors:[selectFromMarquee()] } }}`, `geometry={{ pickEvery: (x,y)=>adapter.hitAll(x,y).map(n=>n.id),
   boundsOf: adapter.getBounds }}`, and the new `layouts` prop wiring `plantingLayout`.
   Drop the two `useEricSelectTool` registrations from `useTools`; keep `cycleTool`, pan/zoom/insert/
   palette tools.
3. Re-home surviving custom click semantics (from `useEricSelectTool` onClick/onDown): group-outline-edge
   click-to-promote, `select-area` force-marquee, resize-handle hit (or adopt kit corner handles) →
   a small focused tool. Add clash render layer (carryover #2).
4. Repoint behavior imports `../gestures` → `@orochi235/weasel` (`/move`, `/clone`):
   `snapMoveBehaviors.ts`, `structureMoveBehaviors.ts`, `useEricCycleTool.ts`, `useEricSelectTool.ts`(dying).
5. DELETE: `src/canvas/gestures/*` (~2558 LOC); `drag/{moveDrag,resizeDrag}.ts` + their `dragPreview`
   mirrors; `useEricSelectTool.ts` + test. KEEP `drag/{areaSelectDrag,dragPreviewLayer}` (nursery shares),
   palette/plot drags, `useEricCycleTool`. Once kit ghost is confirmed, also delete `moveDrag`/`resizeDrag`
   renderers (kit `usePreviewGhostLayer` replaces them via `drawOne`).
6. Verify gate (one): parity oracle tests (`snapMoveBehaviors`, `structureMoveBehaviors`,
   `useEricCycleTool`, `plantingLayout`), full `npx vitest run`, `npx tsc -b`, `npx biome check .`,
   visual **5/5**. Report eric LOC deleted.

## Watch
- Confirm `usePreviewGhostLayer` actually fires under `enableGestureDispatcher` + scene slot (it walks
  `dispatcher.getInFlightHandles()` for `previewIds/previewPose`). That's what makes the kit ghost work
  and lets eric's ghost façade die.
- eric's `groupId` is membership/selection, NOT a kit container. Don't reintroduce a membership "group".
