# Handoff — SceneCanvas migration through Phase 6 (2026-06-15)

Branch `fix/canvas-text-rendering`. Tree clean. All gates green: `tsc -b` (only the 4 known
`@weasel-js/history` dts leaks), `npm run lint` clean, `npm test` **826**, `npm run test:visual` **4/4**.

## What happened this session (resumed from the 2026-06-14 handoff)
On resume, work was already through **Phase 4**. This session shipped **Phase 5** and **Phase 6**.

### Phase 5 — `SerializedScene` persistence (seam #13) ✅
Commits `9c12fb4` (plan) · `4849e3c` · `c3ef737`.
- `serializeGarden` now writes `{ ...base, scene: SerializedScene }` (via `gardenToSerializedScene`) and drops the `structures`/`zones`/`plantings` arrays.
- `deserializeGarden` still returns `Garden` (callers untouched); branches on a `scene` key — new format rebuilds arrays via `loadState`+`sceneToGarden`, legacy garden-array files take the unchanged migration pipeline. Autosave/localStorage migrate transparently.
- Fully contained in `src/utils/file.ts` + tests. `public/*.garden` fixtures deliberately left legacy (keep exercising the legacy path).

### Phase 6 — garden canvas swap, "big-bang minus move" ✅ (your call)
Commits `…` (plan) · `getScene()` accessor · `<SceneCanvas>` swap.
- Garden host swapped: bare `<Canvas adapter=…>` → `<SceneCanvas scene={liveScene}>` in `src/canvas/CanvasNewPrototype.tsx`.
- New `gardenStore.getScene()` exposes the live, identity-stable kit Scene (store-of-record).
- Suppress kit scene painter (`layers={{ scene: null, ...ericDomainLayers }}`); keep eric's domain layers.
- Keep eric's vendored tools as a **takeover `ToolsApi`**; bridge `uiStore.selectedIds` → kit `SelectionApi` (`src/canvas/selectionBridge.ts`, `selectionMode='multi'`); `enableGestureDispatcher`/`enableKeybindings={false}`.
- **Zero behavior/visual change** — garden fixtures pixel-identical.

## The decision that shaped Phase 6 (you chose "big-bang minus move")
**Verified blocker:** in the weasel build eric pins, the kit move action NEVER consumes
`layouts`/`LayoutStrategy` and never invokes `getLayout`/`getDropTargets`/`reflowFor`/`commitDrop`
at runtime (grep-confirmed); its only snap hook is `selectTool.snap: SnapStrategy` (pose→pose),
which eric lacks. So adopting the kit select tool for **move/resize** would regress eric's
planting-into-container cell-grid slot-snapping. You chose to keep eric's vendored move/resize as
the "vendored exception" and land everything else.

**Behavior-preservation proof (no live Playwright needed):** the inner `Canvas` routes pointer to
eric's `tools.dispatcher` (independent of `enableGestureDispatcher`); eric's tools self-hit-test via
the point-pose adapter and read **zero** `ctx.target`/`getNodeAtPoint` (so SceneCanvas's synthesized
hit info can't alter them); 427 canvas unit tests pass; app mounts + renders pixel-identical.

## Deferred (coupled to the move/resize migration — NOT done this phase)
- `src/canvas/adapters/gardenScene.ts` point-pose adapter (still consumed by the takeover tools).
- eric's 3 selection-chrome layers (`group-outlines`/`selection-outlines`/`selection-handles`) — coupled to vendored resize handles + draw domain planting rings/labels the kit overlay lacks.
- kit `selectionOverlay` chrome adoption; `geometry.pickEvery/boundsOf` (moot under takeover tools).

## NEXT — re-scoped #7 + #8 (needs you; do NOT start autonomously)
1. **Weasel-side (you control weasel):** wire the kit move action to consume `layouts`/`LayoutStrategy`
   (reflow + drop + slot-snap) and/or a `SnapStrategy`, so the kit move tool can host eric's container
   snapping. This is the unblocker.
2. **Eric-side, after (1):** adopt the kit `selectTool` (move/resize/area-select) + kit `selectionOverlay`
   chrome; drop eric's 3 selection-chrome layers; retire the point-pose adapter; wire `geometry`.
   eric's `plantingLayout` is already a type-matching `LayoutStrategy` and `findSnapTarget` returns a kit
   `SnapTarget` — they plug in once the weasel engine consumes them. Highest-LOC deletion (~2558 LOC vendored
   gestures); keep eric's gesture tests as the parity oracle; surface any REALLY-bad-fit per behavior.

## Key files
- `src/canvas/CanvasNewPrototype.tsx` (the `<SceneCanvas>` callsite ~`:494`), `src/canvas/selectionBridge.ts`, `src/store/gardenStore.ts` (`getScene()`), `src/utils/file.ts` (Phase 5).
- Plans: `2026-06-15-garden-scenecanvas-phase6-canvas-swap.md`, `2026-06-14-garden-scenecanvas-phase5-persistence.md`. Spec: `specs/2026-06-14-garden-scenecanvas-migration-design.md`.
- weasel: `~/src/weasel/src/interactions/actions/move/` (the engine to wire), `src/canvas/SceneCanvas.tsx` (props), `src/layout/types.ts` (`LayoutStrategy`).
</content>
