# Nursery scene-backing — design

**Date:** 2026-06-20
**Branch:** `phase7-kit-gesture-adoption`
**Status:** approved design, pre-plan

## Why

Weasel HEAD deprecated bare `<Canvas>` and dropped it from the public barrel
(`9b782678`, "fate decided: bare `<Canvas>` is `@internal`/`@deprecated`").
`src/canvas/NurseryCanvas.tsx` still mounts bare `<Canvas adapter={…}>`, so eric
fails to typecheck against HEAD with `error TS2305: Module has no exported member
'Canvas'`. The sanctioned consumer renderer is now `<SceneCanvas>`, which omits
`adapter` and **requires a live kit `Scene`**. The nursery has no Scene — it uses
a hand-written `createNurserySceneAdapter()` reading `garden.nursery` arrays
directly.

The fix is to give the nursery a scene-authoritative store (the seed-starting
analog of garden Phases 1-6) and mount NurseryCanvas on `<SceneCanvas>`. This is
the **last** eric-side error: with weasel's dts-build fixed, `GardenCanvas` and
everything else typecheck clean; only this `Canvas` import remains.

Per Mike's no-internal-API rule, importing `Canvas` from the internal
`./canvas/Canvas` path is **not** an option.

## Scope

**Phases 1-6 analog only.** Make the nursery store scene-authoritative
(serializers, live `NurseryScene`, reconcile, `SerializedScene` persistence +
legacy fallback, scene-snapshot undo), then mount NurseryCanvas on
`<SceneCanvas>` **keeping eric's existing seed tools** (`useSeedlingMoveTool`,
`useSeedSelectTool`, `useSowCellTool`, `useFillTrayTool`, pan/zoom) via the kit's
`tools` **takeover form** with `enableGestureDispatcher={false}`, and keeping the
existing custom render layers.

**Explicitly out of scope** (no Phase 7 analog): the kit gesture dispatcher does
NOT take over nursery gestures; eric's bespoke seed tools stay authoritative.
Seedling move is cell-snapping, swap-aware, and cross-tray — it intentionally
does not adopt the kit's free-pose move model. Scene-slot rendering is not
adopted; the existing custom layers remain.

## Decisive nursery-specific fact: positions are derived, not stored

Garden plantings/structures/zones store explicit free poses; the garden Scene is
the source of truth for *where*. The nursery is the inverse:

- **Tray** positions are derived from array order via `trayWorldOrigin(tray, ss)`
  (column-major auto-flow, `TRAYS_PER_COLUMN = 3`, `TRAY_GUTTER_IN = 2`). No tray
  stores `(x, y)`.
- **Seedling** positions are cell-indexed: world pose =
  `trayWorldOrigin(tray) + cellCenterInches(tray, row, col)`. No seedling stores
  a pose; authority is `(trayId, row, col)`.

Therefore **scene poses are projections** of authoritative cell/index data,
recomputed on every reconcile. The scene never becomes the source of truth for
position — only a spatial projection for rendering, picking, and the canvas
mount. Authority stays with `(trayId, row, col)` and tray array order.

## Architecture

### Scene shape

- **Tray → container node**, layer `'trays'`.
  - Pose = `trayWorldOrigin(tray, ss)` (projection of array order).
  - `data` = the full `Tray`, **including `slots[]`** (the occupancy grid is
    tray-level metadata; empty cells are not nodes).
- **In-tray seedling → leaf child** of its tray, layer `'seedlings'`.
  - **Local** pose = `cellCenterInches(tray, row, col)`. The kit composes
    tray-world + seedling-local → world via `composeRectPose` (same path garden
    uses for plantings under beds).
  - `data` = the `Seedling`.
- **Transplanted-out seedlings** (`trayId = null`, history-only, never rendered):
  **excluded from the scene.** They live in a non-spatial nursery `base` list and
  are merged back into one `seedlings[]` when composing the facade. This mirrors
  how garden keeps non-spatial fields in `base`.

`ScenePose` for the nursery is `{ x, y }` (translation only — no width/height;
seedlings render at icon scale, trays at their own `widthIn`/`heightIn` from
`data`). Pose composition uses the rect-pose helpers; the seedling local pose is
a pure translation to the cell center.

### Two scenes, store seam

A **separate `NurseryScene` instance** alongside the existing garden scene, both
owned by `gardenStore` — they are distinct worlds with distinct canvases and
coordinate spaces. Mirror of the garden seam (`gardenStore.ts:244-483`).

New modules:

- `src/scene/nurseryScene.ts`
  - `createNurseryScene(specs)` — factory (`createScene` + nursery system layers
    if any).
  - `nurseryToScene(ns: NurseryState)` → `AddNodeSpec[]` (trays parent-first,
    then in-tray seedlings as children with cell-center local poses).
  - `sceneToNursery(scene, base)` → `NurseryState` (read tray nodes + seedling
    children — read `(trayId, row, col)` straight from `data`; the scene pose is a
    derived projection, the `data` carries authority). Merge `base.transplanted`
    seedlings into the returned `seedlings[]`.
  - Types `NurseryScene`, `NurseryNodeData`, `NurseryLayer`, `NurseryBase`.
  - (No `nurseryToSerializedScene` — persistence stays array-based; see
    Persistence.)
- `src/scene/reconcileNurseryScene.ts`
  - `reconcileNurseryScene(scene, target)` — in-place differ batched in one
    `scene.batch('reconcile-nursery', …)` (mirror of `reconcileScene.ts:37-91`:
    rebuild changed-kind/layer roots, remove absents bottom-up, add new specs
    parent-first, update survivors with `deepEqual` no-op skipping).

`gardenStore` changes:

- Module-scoped `nurseryScene: NurseryScene` and `nurseryBase: NurseryBase`
  (the transplanted-out list).
- `composeNursery()` — memoized, gated on `nurseryScene.getVersion()` +
  `nurseryBase` identity (mirror of `composeGarden`).
- `subscribeScene` on the nursery scene → recompose `garden.nursery` and `set`.
- `getNurseryScene()` public accessor (mirror of `getScene`).
- Every nursery mutation routes through `reconcileNurseryScene`: `moveSeedling`,
  `sowCell`, `fillTray`, `reorderTrays`, `moveSeedlingsAcrossTrays`,
  `renameTray`, tray add/remove. (Exact action list confirmed during planning by
  grepping `gardenStore` for nursery writers.)

The composed `garden.nursery` keeps its current `{ trays, seedlings }` shape so
no downstream consumer (layers, tools, sidebar) changes.

### Undo (array snapshots — simplification, approved 2026-06-20)

The nursery keeps its **own** history stack with its **existing array snapshots**
(`nurseryHistory.push(get().garden.nursery, …)`), unchanged from today. Garden
and nursery undo stay independent (garden undo preserves nursery and vice versa).

Garden undo uses `scene.toJSON()`/`loadState` because garden poses are stored
parent-LOCAL and plain arrays round-trip lossily. The nursery has **no such
problem** — positions are derived from `(trayId, row, col)` + array order, so the
arrays are lossless authority. Restoring a nursery snapshot calls
`patch({ nursery })` → `reconcileNurseryScene`, which mutates the scene **in
place** — so the `<SceneCanvas>`-captured scene ref stays valid **without**
`loadState`. No `nurseryScene.toJSON()` / scene-snapshot path is needed.

One checkpoint per action preserved (every writer already funnels through
`commitNursery`).

### Persistence (array on disk — simplification, approved 2026-06-20)

The nursery persists on disk as plain `nursery: { trays, seedlings }` arrays
(today's format), because those arrays are lossless authority — there is no
nested-local-pose round-trip problem that forced garden to a `SerializedScene` on
disk. The store rebuilds the nursery scene from the arrays on load, exactly as it
bootstraps. Consequences:

- **No `nurseryToSerializedScene` converter and no legacy-format migration** —
  the array shape never changes.
- The only persistence edit: once `nursery` leaves `GardenBase` (it becomes
  scene-backed, no longer in `base`), `serializeGarden`'s `...base` spread stops
  including it, so re-add `nursery: garden.nursery` explicitly to the serialized
  output. `deserializeGarden` already reads `data.nursery` arrays and the store's
  `adoptGarden` builds the nursery scene from them.

### Canvas mount (the goal)

`src/canvas/NurseryCanvas.tsx`:

- Swap `<Canvas<SeedNode, ScenePose> adapter={adapter} …>` →
  `<SceneCanvas scene={nurseryScene} …>`.
- `scene` captured once: `useMemo(() => useGardenStore.getState().getNurseryScene(), [])`.
- `tools={tools}` in **takeover form** (the existing `useTools({active, registry,
  ambient})` result is a `ToolsApi`), `enableGestureDispatcher={false}`.
  Keybindings handled as today.
- Keep the existing custom `layers` map, local view state (`view`/`viewRef`,
  `toKitView`/`fromKitView`), `palettePointerPayload` plumbing, tray-rename
  overlay, fit-view logic — all unchanged.
- `geometry.pickEvery` → the existing world-frame hit stack
  (`adapter.hitAll(x,y).map(n => n.id)`), so picking stays nursery-correct
  (children over containers, multi-tray).
- `createNurserySceneAdapter()` is reduced to whatever eric's seed tools still
  consume directly (move/select/sow/fill read it for hit-testing, cell math, and
  snap targets). Planning will audit each tool's adapter usage and decide whether
  the adapter retires entirely or shrinks to a tool-facing helper. It does NOT
  become SceneCanvas's adapter (SceneCanvas synthesizes its own from the scene +
  `layouts`).

## Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `nurseryScene.ts` | Pure converters NurseryState ↔ Scene/SerializedScene | weasel `createScene`/pose helpers, `model/nursery` |
| `reconcileNurseryScene.ts` | In-place scene diff/apply for one mutation | `nurseryScene.ts`, weasel Scene ops |
| `gardenStore` nursery seam | Live scene, compose facade, route mutations, array undo, accessor | the two modules above |
| `file.ts` (persist) | Re-add `nursery` arrays to serialized output (one-line, post base removal) | — |
| `NurseryCanvas.tsx` | Mount on `<SceneCanvas>`, retain eric tools/layers/view | `getNurseryScene`, existing tools/layers |

Each converter is independently testable (round-trip
`sceneToNursery(loadState(nurseryToSerializedScene(ns))) deepEquals ns`). The
reconcile differ is testable in isolation (apply a target, assert scene nodes).
The store seam is testable via existing nursery action tests (behavior unchanged
through the facade).

## Testing

- **Round-trip:** `nurseryToScene` → `createNurseryScene` → `sceneToNursery`
  equals the original `NurseryState` (including transplanted-out seedlings via
  base, multi-tray auto-flow, occupied/empty cells).
- **Reconcile:** each nursery mutation produces the expected scene node set; one
  batch / one notification; no-op edits skipped.
- **Undo:** a nursery action then undo restores prior state; nursery undo does not
  touch garden and vice versa; scene instance identity stable across the
  array-snapshot restore (reconcile is in-place).
- **Persistence:** `serializeGarden` output still includes `nursery: { trays,
  seedlings }` after nursery leaves `base`; `deserialize(serialize())` round-trips
  the nursery; existing legacy `.garden` files still load.
- **Existing suites:** all current nursery tests (`useSeedlingMoveTool`,
  `useSeedSelectTool`, `useFillTrayTool`, `useSowCellTool`, `gardenStore`
  nursery actions, `nurseryScene`/hit-test) pass unchanged — the facade shape is
  preserved.
- **Gate:** `npx tsc --noEmit -p tsconfig.app.json` clean (no `Canvas` import
  error), full `npx vitest run`, `npx biome check .`, visual smoke of the
  seed-starting view.

## Risks / watch

- **Pose projection drift:** because tray/seedling poses are recomputed
  projections, the reconcile differ must re-derive them on any change that moves
  a tray in the auto-flow (e.g. `reorderTrays`, tray add/remove changes every
  downstream tray origin and cascades to its seedlings' world poses — though
  seedling *local* poses are stable). Reconcile must recompute tray poses from
  order each pass, not diff against stale values.
- **`slots[]` vs seedling nodes redundancy:** occupancy lives both in tray
  `slots[]` (as node data) and implicitly in which seedlings are children. The
  facade composition must keep them consistent; `sceneToNursery` reads authority
  from `data`, not from child-presence.
- **Adapter audit:** the seed tools' reliance on `createNurserySceneAdapter`
  needs a per-tool read during planning to avoid breaking gesture behavior when
  the adapter is no longer SceneCanvas's.
- **`ScenePose` width/height:** confirm SceneCanvas/selection chrome tolerate a
  translation-only pose for leaf seedlings (garden plantings carry footprint
  size; seedlings render at icon scale). If chrome needs bounds, supply them from
  `data`/cell pitch via `geometry.boundsOf`.

## Non-goals

- Kit gesture dispatcher / scene-slot rendering for the nursery (Phase 7 analog).
- Changing the nursery data model to store explicit poses.
- Any change to garden mode.
- Bench/shelf parents or other nursery features in `docs/TODO.md`.
