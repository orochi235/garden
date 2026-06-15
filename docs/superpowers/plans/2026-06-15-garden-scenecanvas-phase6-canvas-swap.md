# Garden → SceneCanvas Phase 6: canvas swap (big-bang minus move) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Move eric's GARDEN canvas off the bare weasel `<Canvas adapter=…>` onto `<SceneCanvas scene={liveScene}>` — the supported consumer surface weasel is retiring `<Canvas>` in favor of. Pass eric's B1 kit Scene (already the spatial store-of-record) as the live `scene`, keep eric's domain render layers, suppress the kit default scene slot, and **keep eric's vendored tools/gestures as a takeover `ToolsApi`** (the surfaced "vendored exception"). Bridge `uiStore` selection to SceneCanvas so the kit *knows* the selection. Target: **zero behavior/visual change** — the garden looks and behaves identically; only the host component changes.

## Decisions baked in (Mike, 2026-06-15)
- **Big-bang minus move.** The kit's move action does NOT consume `layouts`/`LayoutStrategy` and never invokes `getLayout`/`getDropTargets`/`reflowFor`/`commitDrop` at runtime in the pinned weasel build (verified by grep); its only snap hook is `selectTool.snap: SnapStrategy` (pose→pose), which eric does not have (eric's container snapping lives in `findSnapTarget`, a different `MoveAdapter` surface the kit move tool doesn't read). So adopting the kit select tool for move/resize would **regress** eric's planting-into-container cell-grid slot-snapping. → **Keep eric's vendored move/resize/select tools** (takeover `tools` prop) until a later phase wires the weasel move-layout engine.
- **Coupling consequence (why kit selection-chrome adoption also defers):** the kit `selectionOverlay` renders the resize handles, and eric's *vendored* resize gesture hit-tests its OWN handles; adopting kit chrome while vendoring resize would split visible handles from their hit-targets, and eric's selection chrome additionally draws domain visuals (planting selection rings, selected labels) the kit overlay lacks. Selection-chrome adoption is therefore coupled to the move/resize migration and **defers with it**. Phase 6 keeps eric's selection-chrome layers, but **bridges selection state now** so the future chrome swap is a one-liner.
- **Geometry (`pickEvery`/`boundsOf`) is moot under takeover tools** — SceneCanvas only consumes `geometry` for its *internal* select tool, which a takeover `tools` prop bypasses. eric's tools keep doing their own hit-testing via the point-pose adapter. → not wired in Phase 6.
- **Fonts are already done** (committed `ca0d65c`/`a31b782`: `main.tsx` registers the Inter MSDF atlas at boot; atlas in `public/fonts/inter/`). SceneCanvas wraps the same renderer/registry, so text keeps rendering. → no font work here.

**Net Phase 6 deliverable:** garden runs on `<SceneCanvas>` with eric's tools + layers intact and selection bridged — a clean surface swap, no regression. The kit-gesture / kit-selection-chrome / geometry / move-layout-engine work is the (re-scoped) next phase.

**Tech Stack:** TypeScript, React, weasel `<SceneCanvas>` (`@orochi235/weasel` — note eric still imports the `@orochi235` scope via the `~/src/weasel` symlink; the dist exports `SceneCanvas` from the main barrel and `registerFont` from `/renderer`, both verified present), Zustand, the B1 kit `Scene`, Vitest, Playwright visual suite.

---

## Context for the implementer

- Spec: `docs/superpowers/specs/2026-06-14-garden-scenecanvas-migration-design.md` seam #6 (canvas swap) + #8/#10 (selection — partially, bridge only). Read the "Implementation phases → 6" line.
- **Read fully before coding:**
  - `src/canvas/CanvasNewPrototype.tsx` — the garden host. The bare `<Canvas>` callsite is at ~`:493-503`; `tools = useTools({...})` at `:467`; the `layers` memo at `:212-338`; `view`/`onViewChange` at `:344-366`; the `ActiveToolContextProviderIfRoot` wrap at `:58-62`; the adapter `createGardenSceneAdapter()` at `:104`.
  - `src/store/gardenStore.ts` — the live `scene` is a **private module `let scene`** (~`:261`, re-bootstrapped ~`:469`); the public store exposes only `garden` + actions, **no scene accessor** (Task 0 adds one). Instance identity is stable for the store lifetime (load/undo/redo use `scene.loadState` in place; all mutation bumps `getVersion()` — Phase 3/4).
  - `src/store/uiStore.ts` — `selectedIds: string[]` + `setSelection`/`addToSelection`/`clearSelection` (~`:340-346`). No `toggle`/`get`/`contains`.
  - weasel `SceneCanvas.tsx` prop contracts (quoted in the Phase 6 investigation; key ones below).
- **Provider note:** every SceneCanvas-internal provider is `*IfRoot` (detects an existing ancestor and no-ops). eric's existing `ActiveToolContextProviderIfRoot` wrap at `CanvasNewPrototype.tsx:59` is therefore safe (SceneCanvas's inner one defers to it) and **must stay** (the nursery canvas, still on bare `<Canvas>`, also sits under it). No double-wrap fix needed.

### Verified SceneCanvas prop contracts used here
- **`scene`** (required): a live `Scene` is used as-is and SceneCanvas mutates THAT instance; `useSyncExternalStore(scene.subscribe, scene.getVersion)` repaints on version bump (`SceneCanvas.tsx:744-753`). A `SerializedScene` would be baked once via `useState` — we want the **live instance**, so pass `getScene()`.
- **`tools`** (takeover form): a full `ToolsApi` (has `setActive`) is forwarded as-is and **bypasses the internal select tool** (`SceneCanvas.tsx:688-692`, `:1057-1085`). eric's `useTools(...)` return is exactly this.
- **`layers`**: deep-merged via `mergeLayersWithDefaults` (`:216-249`). Custom keys pass through untouched. `layers={{ scene: null }}` suppresses the kit default scene painter (`:234-235`). eric passes `{ scene: null, ...allEricLayers }`.
- **`selection`** (`SelectionApi`): consumer-supplied wins over internal (`:820-821`); the selection-overlay chrome reads `selection.current` (`:1373`,`:1433`) — but eric keeps its OWN chrome layers this phase, so the bridge's job is just to keep the kit's selection state in sync with `uiStore` for the future chrome swap and to avoid the kit's internal selection diverging. Full `SelectionApi` shape: `current`, `get`, `set`, `add`, `remove`, `toggle`, `clear`, `contains`, `applyClick(id, {shift,meta,ctrl})`, `adapterMethods:{getSelection,setSelection}` (`useSelection.ts:15-44`).
- **`selectionMode`**: pass `'multi'` (eric supports multi-select + marquee) (`:387`,`:814-819`).
- **`enableGestureDispatcher` / `enableKeybindings`**: the kit's gesture dispatcher + StandardActions mount by default and would compete with eric's takeover tools for pointer/keyboard. **Default to `enableGestureDispatcher={false}`** and validate; keep `enableKeybindings` only if eric relies on kit keybindings (it doesn't — eric wires its own). Set both `false` unless a gate regresses, then narrow.
- **`width`/`height`/`view`/`onViewChange`**: inherited from `CanvasProps` unchanged — forward eric's existing values (`toKitView(view)` / `handleViewChange`).
- **Do NOT pass** `adapter` (Omit-stripped — owned/synthesized from `scene`), nor `pickEvery`/`boundsOf`/`snap`/`moveOptions`/`selection`-less tools at top level (folded into `geometry`/`selectTool`, unused here).

### Scope boundaries (do NOT touch)
- `src/canvas/NurseryCanvas.tsx` — nursery stays on bare `<Canvas>` (separate cycle).
- `src/canvas/adapters/gardenScene.ts` (point-pose adapter) — eric's takeover tools STILL consume it, so it is **NOT** retired this phase (retires with the move/resize migration).
- Move/resize/select gesture logic, `useEricSelectTool`, the vendored `src/canvas/gestures/*` — unchanged.
- eric's selection-chrome layers (`group-outlines`, `selection-outlines`, `selection-handles`) — **kept** this phase.
- The kit, `main.tsx` font registration — unchanged.

### Parity oracle
The Playwright visual suite (`npm run test:visual`, fixtures `garden-empty`, `garden-mixed`, `nursery-empty`, `nursery-with-seedlings`) is the primary gate: **garden fixtures must stay pixel-identical** (this is a host swap, not a render change). Plus `npm test` (store/canvas unit suites) and `tsc -b`/lint.

---

## Task 0: Expose the live Scene from the store

**Files:** Modify `src/store/gardenStore.ts` (+ its public type), Test `src/store/gardenStore.*.test.ts` (add a small accessor test).

- [ ] **Step 1:** Read `gardenStore.ts` around the module `let scene` (~`:261`), the `create<GardenStore>` body, and the `GardenStore` interface (~`:40-149`). Confirm the instance is stable (never reassigned post-bootstrap except via `loadState` in place).
- [ ] **Step 2:** Add a `getScene(): GardenScene` accessor to the store API (a method on the store object returning the module `scene`, OR a stable getter). It must return the CURRENT live instance (which is identity-stable). Add `getScene` to the `GardenStore` interface and import/return type `GardenScene` from `../scene/gardenScene`.
- [ ] **Step 3 (TDD):** Add a test asserting `useGardenStore.getState().getScene()` returns a `Scene` whose `getVersion()` increases after a `commitStructureUpdate`, and whose identity is **unchanged** across an `undo()` (proves in-place restore — the prop ref a component holds stays valid). Run it; make it pass.
- [ ] **Step 4:** `npx tsc -b` (only the 4 known history dts leaks) + `npx vitest run src/store/`. Commit: `feat(store): expose live Scene via getScene() for SceneCanvas mount`.

---

## Task 1: Swap the garden `<Canvas>` → `<SceneCanvas>` (takeover tools, scene slot suppressed, selection bridged)

**Files:** Modify `src/canvas/CanvasNewPrototype.tsx`. Possibly add `src/canvas/selectionBridge.ts` (the `SelectionApi` over `uiStore`).

- [ ] **Step 1 — selection bridge:** Create a `useGardenSelectionApi()` hook (new `src/canvas/selectionBridge.ts`) returning a memoized `SelectionApi` bridged to `useUiStore`:
  - `current` ← `useUiStore(s => s.selectedIds)` (ref changes on update — drives the kit chrome later);
  - `get()` ← `useUiStore.getState().selectedIds`; `set`/`adapterMethods.setSelection` ← `setSelection`; `add` ← `addToSelection`; `remove`/`toggle`/`contains`/`clear` ← implement over `getState()`/`setSelection`/`clearSelection`; `applyClick(id, mods)` ← single-replace unless `mods.shift` (extend/toggle), matching eric's existing click policy in `useEricSelectTool`. Cast `string[] ↔ NodeId[]` at the boundary. Keep mutators stable (`useMemo`/`useCallback`).
  - **Note:** eric's vendored tools remain the authoritative selection driver this phase; the bridge mirrors `uiStore` into the shape SceneCanvas expects. Do not route canvas clicks through `applyClick` yet (the takeover select tool already does selection).
- [ ] **Step 2 — swap the JSX:** In `GardenCanvasNewPrototype`, replace the `<Canvas<SceneNode, ScenePose> … />` (`:494-502`) with:
  ```tsx
  <SceneCanvas
    scene={scene}                      // useGardenStore.getState().getScene() captured via a hook/selector
    width={width}
    height={height}
    view={toKitView(view)}
    onViewChange={handleViewChange}
    layers={layersWithSuppressedScene}  // { scene: null, ...layers }
    tools={tools}                       // eric's takeover ToolsApi (unchanged)
    selection={selectionApi}
    selectionMode="multi"
    enableGestureDispatcher={false}
    enableKeybindings={false}
  />
  ```
  Obtain the live scene with a store selector/hook that returns `getScene()` (stable ref). Build `layersWithSuppressedScene = useMemo(() => ({ scene: null, ...layers }), [layers])`. Update the import: `Canvas` → `SceneCanvas` from `@orochi235/weasel`. Keep the generic params if `SceneCanvas` accepts them (`SceneCanvas<GardenNodeData, GardenLayer, GardenPose>`); otherwise drop and let inference work. Remove the now-unused `adapter` PROP from the JSX **but keep `createGardenSceneAdapter()`** — the tools still consume it (it's passed into `useEricSelectTool`/`useTools`, not the canvas).
- [ ] **Step 3 — typecheck the prop surface:** `npx tsc -b`. Resolve type mismatches: scene generic params, `LayersMap` shape for the `scene: null` slot (the merge accepts `scene: null`), `SelectionApi` `NodeId` branding (cast at the bridge boundary). Expect only the 4 known history dts leaks afterward.
- [ ] **Step 4 — unit suites:** `npx vitest run src/canvas/ src/store/`. Fix any test that imported/mounted the bare `<Canvas>` indirectly.
- [ ] **Step 5 — VISUAL GATE (the real proof):** `npm run test:visual`. Expect **4/4 with garden fixtures pixel-identical**. If `garden-mixed`/`garden-empty` diff:
  - blank/!text → renderer/scene not mounting; check `scene` is the live instance and `enableGestureDispatcher`/scene-slot suppression.
  - missing selection chrome → eric's chrome layers got dropped by the merge; confirm `{ scene: null, ...layers }` preserves all custom keys.
  - doubled/garbled gestures → the kit dispatcher is competing; confirm `enableGestureDispatcher={false}`.
  Iterate until pixel-clean. Capture the diff artifacts if any fixture legitimately changed and report before updating snapshots.
- [ ] **Step 6 — manual behavior smoke (headless, no focus steal):** Per the spec's "headless render proof" pattern, drive the dev build headlessly (Playwright, background/headless) to confirm: select a structure (eric chrome appears), drag-move a planting into a container (cell-grid snap still works — the vendored move path), marquee-select, zoom/pan, undo/redo. Report results; do not steal foreground focus.
- [ ] **Step 7:** Commit: `feat(canvas): mount garden on <SceneCanvas> (takeover tools, scene slot off, selection bridged)`.

---

## Task 2: Full gate run + cleanup

- [ ] **Step 1:** `npx tsc -b` (4 known leaks only). Remove any now-dead imports (`Canvas` if fully replaced; confirm `NurseryCanvas` still imports `Canvas` separately — don't touch its import).
- [ ] **Step 2:** `npm run lint` (biome `--write` the touched files if needed).
- [ ] **Step 3:** `npm test` — all green (≥ current count + Task 0 accessor test).
- [ ] **Step 4:** `npm run test:visual` — 4/4.
- [ ] **Step 5:** Commit any fixups. Update the migration-status memory: Phase 6 done (surface swap + selection bridge); the re-scoped next phase = "weasel move-layout engine + kit gesture/selection-chrome adoption (retires vendored move/resize + eric selection chrome + point-pose adapter)".

---

## Risks / open items
- **`enableGestureDispatcher={false}` correctness:** if eric's takeover tools secretly relied on the kit dispatcher under bare Canvas (they shouldn't — bare Canvas routes pointer to the active tool directly), pointer handling could break. Validated by Task 1 Step 6 smoke. If broken, try `true` and narrow which standard actions conflict.
- **Scene slot suppression vs. domain layers:** eric draws everything via its own screen-space layers; `scene: null` must not also drop a layer the kit injects that eric needs. The visual gate catches this.
- **Selection bridge ref churn:** `current` must be a referentially stable array except when `selectedIds` actually changes, or the kit re-renders excessively. Use the Zustand selector's identity directly.
- **Live-scene prop identity:** the component must capture the SAME instance every render (Task 0 guarantees identity stability). If a hook returns a new wrapper each render, SceneCanvas won't see it as the same scene. Pass the raw instance.
- **The `@orochi235` vs `@weasel-js` scope drift** (weasel-pin): eric resolves SceneCanvas/registerFont from the symlinked dist under `@orochi235`. Confirmed present in the current build; if a weasel rebuild changes the scope, eric's imports break — out of scope here, tracked by `weasel-pin`.

## Self-review (against spec + decisions)
- Seam #6 canvas swap: garden on `<SceneCanvas scene=liveInstance>`, scene slot suppressed, domain layers kept. ✅
- Move/resize NOT adopted (verified kit blocker) — vendored tools kept as takeover; selection-chrome adoption deferred (coupled). ✅
- Selection state bridged now (`SelectionApi` over `uiStore`) so the future chrome swap is minimal. ✅
- Zero-regression target enforced by the visual suite as parity oracle. ✅
- Nursery / adapter / vendored gestures / fonts untouched. ✅
</content>
