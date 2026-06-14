# SP2–SP4 — weasel HEAD cutover (coupled) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans or superpowers:subagent-driven-development. This is a large, type-error-driven migration; work the error surface down to zero, then the behavioral gates.

**Decision (Mike, 2026-06-13):** Do the **coupled cutover** — migrate the garden AND nursery canvases onto weasel HEAD's Action API together on `main`, accept transient breakage ("in flux for an hour or whatever"), then flip green. This collapses roadmap SP2 + SP3 + SP4 into one cutover. The roadmap's incremental "app stays working after every SP" constraint is **explicitly relaxed**.

**Goal:** eric runs on weasel **HEAD** (`~/src/weasel`, currently `6e11250e`) using the declarative Action API throughout; the hand-rolled `dragPreview`/putative-drag subsystem is deleted where the kit now owns it; the pin (`~/src/weasel-eric-pin` @ `323d0914`) is dropped. SP1 (Scene as garden data core) is already shipped on `main`.

**Current state at plan authoring:**
- Symlink **already flipped to HEAD**: `node_modules/@orochi235/weasel → /Users/mike/src/weasel`. `package.json` dep is `file:../weasel` (HEAD); `npm install` recreates the HEAD link.
- To revert to the working pinned state at any time: `rm node_modules/@orochi235/weasel && ln -s ~/src/weasel-eric-pin node_modules/@orochi235/weasel`.
- `tsc -b` against HEAD = **198 errors** (baseline was clean on the pin). This number is the migration's burn-down metric.

---

## Empirical break surface (the 198 errors, `tsc -b` 2026-06-13)

**True "API removed" breaks (6):** `useMove`, `useResize`, `useAreaSelect`, `useClone` (×2), `Paint` — all in `src/canvas/tools/useEricSelectTool.ts` and `useEricCycleTool.ts` (+ `Paint` in layers).

**Root causes of the ~190 cascade errors:**
1. **Adapter shape delta** — eric's adapters (`GardenSceneAdapter`, `*MoveAdapter`, `ResizeAdapter` compositions, `GardenInsertAdapter`, `NurserySceneAdapter`) carry `applyBatch`/`applyOps` methods the **pin's** adapter interfaces had; HEAD removed them in favor of `sceneToAdapter(scene, opts)` + direct scene ops. Every `adapter.applyBatch(...)` call and every adapter type that `extends` a kit adapter breaks.
2. **Scene/pose type delta** — HEAD's `Scene<TData,TLayer,TPose>` adds history/journal methods (`historyEntries/historyIndex/jumpToHistoryIndex`, `registerOp/recordOp`, `setLayer/setLayerVisible/setLayerLocked`, `ancestorsOf`, `toJSON`) and tightens pose/ops typings. Cascade: TS2363/TS2722/TS18048/TS7006 (arithmetic-on-unknown, invoke-possibly-undefined, implicit-any) flow from the broken generic params.
3. **Renamed render types** — `Paint` (and likely a couple of layer/draw-command type names) renamed/removed; the layer painters (`selectionLayersWorld`, `zoneLayersWorld`, `plantingLayersWorld`, `trayLayersWorld`, `debugLayers`) need the HEAD names.

**Errors by file (top):** `insert.test.ts` 28, `CanvasNewPrototype.tsx` 14, `useEricSelectTool.ts` 13, `selectionLayersWorld.ts` 12, `gardenStore.test.ts` 8, `structureMoveBehaviors.test.ts` 7, `useSeedlingMoveTool.test.ts` 6, `useEricCycleTool.ts` 6, `NurseryCanvas.tsx` 6, then the 7 adapters at ~3 each. ~Half the errors are in `.test.ts` files and follow their impl.

**Packaging note (possible SP0 follow-up):** 3 × `TS2307` cannot-find-module `../weasel/packages/weasel-history/src/history.ts` — HEAD's `dist` still leaks a raw-source import path for a history symbol eric imports. Confirm whether eric imports a history symbol that isn't bundled into `dist/index.js`; if so, either stop importing it or extend the weasel `noExternal` (SP0 fix) to cover it.

---

## HEAD Action API — the surfaces eric maps onto

(From the HEAD API survey, `~/src/weasel/src` + `dist/index.d.ts`.)

- **Action descriptors:** `moveAction`, `resizeAction`, `rotateAction`, `areaSelectAction`, `cloneAction`, `insertAction`, `clearSelectionAction` + viewport actions. Registered via `useActionsRegistry`/`useStandardActions`; dispatched by `useGestureDispatcher`.
- **Dep registry:** `useDepSource(name, () => value)` / `DepRegistryProvider`. Standard deps: `selection`, `view`, `scene`, `history`, `pointer`, `activeTool`, `areaSelect`, `nodeAtPoint?`, `insert`, `resizePolicy?`, `dispatcher?`.
- **`SceneCanvas`** wires all five kit-root contexts (actions/deps/selection/pointer/active-tool) and the built-in layer slots (`scene`, `selectionOverlay`, `dispatcherOverlay`, `previewGhost`, grid, cell-highlight, debug). Props: `scene`, `selection`, `actions`, `layers`, `tools`, `pickEvery`, `boundsOf`, `moveOptions`/`resizeOptions`/etc.
- **`sceneToAdapter(scene, opts)`** synthesizes Move/Resize/Rotate/AreaSelect/Insert/LayerEnumerable adapters from a `Scene`. Opts: `commitInsert`, `insertLayer`, `selection`, `poseBounds`, `layouts` (per-container `LayoutStrategy`), `cascadeContainerPose`, `kindOf`.
- **`useSelectTool(adapter, opts)`** — pickEvery/pickBest/boundsOf/reparentOnDrop/onDoubleTap → routes body-drag→move, handle-drag→resize, empty→areaSelect, empty-click→clearSelection.
- **`registerNodeShape({id, matches, paint, silhouette})`** — custom node painters; ghosts reuse `silhouette`/`paint`.
- **`LayoutStrategy<TPose>`** — `snap`, `getChildPositions`, `getDropTargets`, `reflowFor`, `commitDrop(...) → Op[]`, `contains?`. Eric's `plantingLayout.ts` already implements this shape (on the pin); re-fit to HEAD's signature.
- **`ResizePolicy<TPose>`** — `constraints: BoundsConstraint[]`, `pointSnap: PointSnapBehavior[]`, `expandIds`, `projection`. Source via `useDepSource('resizePolicy', …)`.
- **`useClipboardOps(adapter, {getSelection, onPaste?, pasteLabel?, getDropPoint?})`** — replaces the pin's `useClipboard`.
- **Preview:** `previewGhost` layer driven by `OngoingHandle.previewIds()/previewPose(id)`; `dispatcherOverlay` driven by `overlay()` (marquee/lasso/insertPreview/custom `commands`). **No custom mid-gesture painting API yet** (kit "Phase 7 TBD").

### Three HEAD gaps that hit eric's bespoke behaviors (design these explicitly)
1. **Union-AABB clamp across the whole dragged group.** HEAD `MoveBehavior.onMove` fires only for the primary id (same limitation the pin had — eric already compensates with `unionDraggedAABB` in `structureMoveBehaviors`). Port that compensation; if HEAD exposes an `onMoveAll`/group hook, prefer it.
2. **Alt-gate for clone.** `cloneAction` always fires when routed; modifier discrimination is a **dispatcher binding** concern on HEAD. Wire the alt-drag→clone gate at binding registration, not inside the action.
3. **Custom mid-gesture preview drawing** (snap-target outline, clash tint, cell-grid ghost snapping). HEAD only offers `previewIds/previewPose` + `overlay()` `commands`. Map eric's bespoke ghosts onto `overlay()` custom `commands` (world space) — this is the riskiest visual-parity area.

---

## Phasing (coupled, but internally ordered to burn errors down safely)

> Work on `main` (per Mike's pattern this session). Commit after each phase even though the app won't run mid-migration. Keep `tsc -b` error count as the burn-down metric in each commit message.

### Phase H0 — Confirm baseline & packaging
- [ ] Symlink → HEAD (done). `npx tsc -b 2>&1 | grep -c 'error TS'` → record (198 at authoring).
- [ ] Resolve the 3 `weasel-history/src/history.ts` `TS2307` leaks: find eric's history import (`grep -rn "weasel-history\|from '@orochi235/weasel'" src | grep -i histor`); either drop it or fix weasel `noExternal`. Rebuild weasel if changed (`cd ~/src/weasel && npm run build`).
- [ ] `npm test` will be red; that's expected. Record the failing-suite count for burn-down.

### Phase H1 — Scene/adapter core onto HEAD (`sceneToAdapter` + ops)
The garden domain is already a `Scene` (SP1). Re-fit the **adapters** to HEAD:
- [ ] Replace eric's hand-maintained `applyBatch`/`applyOps` adapter methods with `scene.batch(label, () => …ops)` at the call sites; have adapters built via `sceneToAdapter(scene, {layouts, cascadeContainerPose, kindOf, selection, poseBounds})`.
- [ ] Re-fit `src/canvas/adapters/{gardenScene,structureMove,zoneMove,plantingMove,structureResize,zoneResize,insert}.ts` to HEAD adapter interfaces. Update their `.test.ts` (drop `applyBatch` assertions; assert scene state).
- [ ] Re-fit `plantingLayout.ts` to HEAD `LayoutStrategy` signature (`getDropTargets`/`reflowFor`/`commitDrop`).
- [ ] Burn-down checkpoint: re-run `tsc -b`; adapter-cluster errors (~25) should clear.

### Phase H2 — Garden gestures: hooks → Action API
The heart. `src/canvas/tools/useEricSelectTool.ts` (uses `useMove/useResize/useClone/useAreaSelect/cloneByAltDrag`) and `useEricCycleTool.ts`.
- [ ] Stand up the kit gesture stack: `DepRegistryProvider` deps (`scene`, `selection` bridged to `uiStore.selectedIds`, `view`, `pointer`, `resizePolicy`), `useActionsRegistry` + `useStandardActions`, `useGestureDispatcher`. Likely adopt `SceneCanvas` for the garden (or wire the contexts manually if eric keeps its own `Canvas`).
- [ ] Re-express the **bespoke move behaviors** as HEAD `moveAction` behaviors / `resizePolicy` / layout:
  - cell-grid planting-ghost snap → `LayoutStrategy.getDropTargets` + `overlay()` ghost (gap #3).
  - garden-bounds union-AABB clamp → move behavior (gap #1).
  - structure clash detection → move behavior writing `uiStore.dragClashIds` (read-only signal).
  - planting snap-or-revert-on-drop → kit `snapBackOrDelete` policy.
  - group expansion + group-outline-edge click-to-promote → `useSelectTool` `pickBest`/custom hit logic.
  - alt-drag clone → dispatcher binding gate (gap #2).
- [ ] Re-fit `Paint`/render-type renames in the layer painters; move custom node visuals (plant icons, fills, hatching, labels) to `registerNodeShape` painters where it simplifies, else keep eric's `RenderLayer`s if `SceneCanvas` accepts a custom `layers` map.
- [ ] Update `useEricSelectTool.test.ts`, `structureMoveBehaviors.test.ts`, `snapMoveBehaviors.test.ts`, cycle/zoom tool tests.
- [ ] Burn-down checkpoint: garden gesture errors clear.

### Phase H3 — Nursery gestures: hooks/putative-drag → Action API
- [ ] Build `NurseryScene = Scene<NurseryNodeData, NurseryLayer, …>` (trays=containers, seedlings=leaves, inch poses) — or drive the existing nursery model through `sceneToAdapter` if a full nursery-scene is out of scope for the cutover. (Decide: minimal = adapt nursery onto HEAD adapters without a full scene; full = SP3's nursery scene. Coupled cutover favors **minimal** first to reach green, then deepen.)
- [ ] Re-express `useFillTrayTool`, `useSeedlingMoveTool`, `useSeedSelectTool`, `usePaletteDropTool` onto kit actions/overlay. Port the dual move/fill ghosts to `overlay()` commands.
- [ ] Nursery undo: keep the `nurseryHistory` snapshot stack for now (SP1's split) **or** move to scene history if the nursery becomes a real `Scene`. Coupled-cutover-minimal: keep snapshot stack; revisit in cleanup.
- [ ] Update nursery tool tests.

### Phase H4 — Teardown & pin drop
- [ ] Delete superseded drag code: `src/canvas/drag/{areaSelectDrag,seedFillTrayDrag,seedlingMoveDrag,dragGhost}.ts` (+ tests) once the kit owns those gestures; re-evaluate `moveDrag/resizeDrag/plotDrag/gardenPaletteDrag/putativeDrag/useDragController/dragPreviewLayer` — delete whatever the kit's preview now owns.
- [ ] Remove `uiStore.dragPreview`/`setDragPreview` once no reader remains.
- [ ] Clipboard: `useClipboard` → `useClipboardOps` in `App.tsx` + `actions/editing/{copy,cut,paste}.ts`.
- [ ] Delete dead adapters (`nurseryScene.ts` etc.) once gestures route through the kit.
- [ ] **Drop the pin:** keep the symlink/`package.json` on HEAD; remove the `~/src/weasel-eric-pin` worktree (`git -C ~/src/weasel worktree remove`); delete the `weasel-pin` memory note and any pin-assuming docs. Update `sp1-undo-split` memory if undo moved to scene history.

### Phase H5 — Ship gate
- [ ] `tsc -b` → 0 errors. `npm test` → green (≥ the new baseline). `npm run lint` → clean. `npm run check:optimizer-boundary` → clean.
- [ ] `npm run test:visual` → garden + nursery baselines match (this is the **primary behavioral-parity gate**; if a diff appears it's a gesture/render-port regression — fix the port, don't update baselines).
- [ ] Manual smoke on HEAD (`npm run dev`): garden move/resize/rotate/clone/insert/delete + cell-grid planting snap + group select + clash warning + undo/redo; nursery fill/sow/seedling-move/marquee + undo; save/load `.garden`; switch modes.
- [ ] Commit; update `~/src/PROJECTS.md` / eric `CLAUDE.md` if the canvas architecture description changed.

---

## Risks & guardrails
- **Visual parity is the real gate**, and the visual suite is currently garden+nursery canvas fixtures only — extend it if a bespoke behavior (clash tint, snap ghost) isn't covered before relying on it.
- **Keep the `.garden` format and the optimizer boundary untouched** (roadmap invariants). The migration is canvas/gesture-only; don't push Scene types across the optimizer adapter or change `file.ts`.
- **`uiStore` stays** (selection/view/appMode/nursery flags); only gesture wiring changes.
- **Scale:** ~198 type errors + behavioral ports across ~25 files. This is multi-session. Burn the type errors down phase by phase (H1→H2→H3), keeping a running `tsc -b` count, before chasing the behavioral/visual gates (H5). A `Workflow` (pipeline over the adapter/tool/layer files, each: rewrite → `tsc` the file → fix) is well-suited if Mike opts into multi-agent orchestration.
