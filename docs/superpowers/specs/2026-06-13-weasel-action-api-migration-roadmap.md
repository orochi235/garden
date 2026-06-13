# Weasel Action-API Migration — Roadmap

**Status:** approved decomposition; SP0 specced, SP1–SP4 at summary level.
**Goal:** Migrate eric fully onto weasel HEAD's Scene-based canvas + Action API, replacing the
deleted imperative gesture hooks and eric's hand-rolled drag-preview subsystem, so eric can track
weasel HEAD again instead of pinning an old commit.

## Why this exists

weasel HEAD removed the imperative gesture hooks eric depends on (`useMove`, `useResize`,
`useAreaSelect`, `useClone`, `cloneByAltDrag`, `useClipboard`) in a deliberate "phase 14e" refactor.
They were replaced by a declarative model: a `Scene<TData,TLayer,TPose>` data model, a gesture
**dispatcher** + **dep-registry**, **Action descriptors** (`moveAction`, `resizeAction`,
`areaSelectAction`, `cloneAction`, `insertAction`), `useSelectTool` / `useNestedSelectTool`, and
**kit-owned preview rendering** (a preview-ghost layer + a dispatcher-overlay layer). eric currently
pins weasel at commit `323d0914` (2026-05-11) via a symlinked worktree at `~/src/weasel-eric-pin`
because HEAD neither builds nor loads against eric today.

Chosen depth (user decision): **full SceneCanvas adoption** — eric's `gardenStore` snapshot model
is replaced by weasel's `Scene` as the source of truth; both the garden and nursery canvases move
to `SceneCanvas`; the `dragPreview` subsystem is deleted.

Chosen sequencing (user decision): **incremental, both canvases** — data-core first, one canvas at
a time, app stays working after every sub-project.

## Guiding decisions (apply to all sub-projects)

1. **Keep the `.garden` file format.** Do NOT adopt weasel's `scene.toJSON()` serialized shape.
   Convert at the load/save boundary: `.garden` → `Scene` on load, `Scene` → `.garden` on save.
   This preserves every existing saved file, the localStorage autosave, the load-time migrations
   (`migrateHeightToLength`, `seedStarting`→`nursery`, `migrateLayoutsToCellGrid`,
   `snapPlantingsToCellGrid`, `backfillGarden`), and the optimizer's pure-data contract.

2. **The optimizer boundary is sacrosanct.** `src/optimizer/` must keep zero imports from project
   code (enforced by `scripts/check-optimizer-boundary.sh`). The optimizer reads pure-data
   `OptimizationInput` produced by `src/components/optimizer/runOptimizerForBed.ts` from `Structure`
   + `Cultivar[]`. The migration must not push Scene types across that adapter; the adapter converts
   from whatever the in-memory model is into the existing pure-data shapes.

3. **Two scenes, not one.** The garden (`structures`/`zones`/`plantings`) and the nursery
   (`trays`/`seedlings`, inch-based, slot arrays) are independent scenes with different
   `TData`/`TLayer`/`TPose`, layout strategies, and node-shape painters. They migrate separately
   (SP2, SP3).

4. **`uiStore` stays.** It holds transient UI/view state (selection, view, `appMode`, nursery UI
   flags). Only the *domain* state (`gardenStore.garden`) and its undo move onto the Scene. Selection
   bridges to weasel's `SelectionApi`.

5. **Ship gate per sub-project:** full vitest suite green (currently 758 tests), visual-regression
   suite green where the canvas is touched, `check:optimizer-boundary` clean, `.garden` round-trip
   verified, undo/redo verified. The app must run after each SP.

## Sub-projects

| SP | Title | Repo | Scope | Visible change |
|----|-------|------|-------|----------------|
| SP0 | weasel packaging fix | weasel | days | none (unblocks builds) |
| SP1 | Scene as the garden data core | eric | 1–2 wk | none (behavior-identical) |
| SP2 | Garden canvas → SceneCanvas + Action API | eric | 1–2 wk | gesture/preview internals |
| SP3 | Nursery canvas → SceneCanvas | eric | ~1 wk | gesture/preview internals |
| SP4 | Decommission dragPreview, clipboard, drop pin | eric | days | none |

Each SP gets its own `docs/superpowers/specs/<date>-spXX-*-design.md` + implementation plan when we
reach it. This roadmap fully specs SP0 (ready to execute) and summarizes SP1–SP4.

---

## SP0 — weasel packaging fix (DETAILED — ready to execute)

**Problem.** weasel's `dist/index.js` imports `from '@orochi235/weasel-history'` and
`from '@orochi235/weasel-gestures'`. tsup externalizes them because they're in the main package's
`dependencies`. Their package.json `main`/`exports` point at raw `./src/index.ts` (no build, no
`dist/`), and that source uses tsconfig-`paths` alias imports — e.g. `weasel-history/src/history.ts`
imports `core/ops/registry` and `debug/flag`, which resolve via the **main** weasel tsconfig
(`"core/*": ["./src/core/*"]`) to the main package's source. A downstream consumer (eric) whose
bundler follows the bare specifier into that source has no such aliases → vite 500
(`Failed to resolve import "core/ops/registry"`).

**Key constraint.** These sub-packages are NOT independently buildable: they reach into the main
package's internals (`core/`, `debug/`) through shared umbrella-tsconfig aliases, not public API.
Building them standalone would require depending on the main package's compiled output for internals
they currently access privately — circular and wrong. Therefore the fix is to stop externalizing
them.

**Approach (recommended): bundle sub-packages into the main dist.**
Add `noExternal` to `/Users/mike/src/weasel/tsup.config.ts` so esbuild inlines the entangled
sub-packages into `dist/index.js`, resolving their `core/*` / `debug/*` aliases with the same
tsconfig paths the main build already uses:

```ts
export default defineConfig({
  // …existing…
  external: ['react', 'react-dom'],
  noExternal: [/^@orochi235\/weasel-(history|gestures|modes)$/],
});
```

Then rebuild weasel (`npm run build` in `~/src/weasel`) and confirm `dist/index.js` no longer
contains `from '@orochi235/weasel-history'` / `-gestures`.

**Alternatives considered.**
- *Build each sub-package* — rejected: they import the parent's `core`/`debug` via alias, so they
  can't build in isolation without exposing those as public API first (a larger refactor).
- *Rewrite alias imports to relative paths in sub-package source* — rejected: still ships raw TS to
  consumers and is fragile; doesn't address the missing build.

**Scope note.** This fixes consumers of the main `@orochi235/weasel` package (eric only imports the
main package). Direct importers of `@orochi235/weasel-history` would still get raw source — out of
scope; eric does not import the sub-packages directly.

**Verification (the SP0 ship gate).**
1. weasel `dist/index.js` has no external `@orochi235/weasel-*` import.
2. Temporarily repoint `eric/node_modules/@orochi235/weasel` at weasel HEAD (not the pin) and run
   `npm run dev`; the app loads with no vite resolution 500. **This will surface the SP1+ work** —
   eric will then fail at the *removed-hook* imports (`useMove`, etc.), which is expected and is what
   SP1–SP4 address. SP0 is "done" when the *packaging* 500 is gone, independent of the hook errors.
3. Repoint eric back at the pin (`~/src/weasel-eric-pin`) so eric keeps working until SP2 lands.
   (HEAD-tracking only becomes permanent at SP4.)

**Risk.** Low. Isolated to weasel's build config. Does not touch eric. Reversible.

---

## SP1 — Scene as the garden data core (SUMMARY — own spec later)

**Goal.** Make `GardenScene = Scene<GardenNodeData, GardenLayer, RectPose>` the source of truth for
garden domain state and undo, with **no visible behavior change**. The existing garden canvas keeps
rendering (still via the current `Canvas` + adapter + `dragPreview`), now fed from the Scene.

**Sketch.**
- Define `GardenNodeData` (the per-node domain payload: structure/zone/planting fields minus pose)
  and `GardenLayer` (`'zones' | 'structures' | 'plantings' | …`). `TPose = {x,y,width,length,…}`.
  Structures/zones become `container` nodes; plantings become `leaf` children (parentId → Scene
  parent). Map eric's `Layout` (cell-grid/single/snap-points) to weasel `LayoutStrategy`.
- Build `gardenToScene(garden)` and `sceneToGarden(scene)` converters. Wire them into
  `src/utils/file.ts` load/save so `.garden` ⇄ Scene at the boundary (migrations run on the
  `.garden` side, unchanged).
- Replace `gardenStore`'s domain mutations + `history.ts` snapshot undo with Scene mutations
  (`scene.add/setPose/move/update/batch`) and Scene history (`undo/redo/canUndo/canRedo`). Keep a
  thin `gardenStore`-shaped selector facade so the hundreds of existing readers (sidebar, properties
  panel, collection editor, optimizer adapter) keep working during SP1; tighten later.
- Keep the optimizer adapter reading `Structure`/`Cultivar[]` — derive those from the Scene in the
  adapter, not across the boundary.

**Ship gate.** Behavior-identical; full suite + visual + optimizer-boundary green; `.garden`
round-trips byte-compatibly (modulo intended migrations); undo/redo parity.

**Open questions for SP1's own spec.** Exact `GardenNodeData`/pose shapes; whether the
`gardenStore` facade is temporary or permanent; how Scene `subscribe`/`getVersion` drives React
re-render vs. the current Zustand selectors; how zIndex/`renderOrder` maps.

## SP2 — Garden canvas → SceneCanvas + Action API (SUMMARY — own spec later)

**Goal.** Replace `Canvas` + `gardenScene` adapter + `useEricSelectTool` + the garden half of
`dragPreview` with `SceneCanvas` + `useSelectTool` + kit actions + kit preview layers + node-shape
painters.

**Hard parts (the real cost).** Porting eric's custom gesture behaviors onto weasel surfaces:
- cell-grid planting-ghost snapping → `LayoutStrategy.reflowFor`/`getDropTargets` + move behavior.
- garden-bounds clamp of the group AABB → move behavior / `resizePolicy.constraints`.
- structure clash detection → `dragClashIds` → custom move behavior writing `uiStore`.
- planting snap-or-revert-on-drop (`requirePlantingDrop`) → layout `commitDrop` returning no-op /
  `snapBackOrDelete`.
- group expansion on drag (`expandToGroups`, structure groups) → `expandIds` / select `pickBest`.
- the implicit group-outline-edge click-to-promote behavior → custom `useSelectTool` hit logic.
- plant icons / structure fills / zone hatching / labels → `registerNodeShape` painters + custom
  `drawOne`.
- plot (rectangle) insert → `insertAction` (note `useInsertTool` survives HEAD; reconcile).

**Ship gate.** Visual-regression parity for the garden canvas; gestures + preview + undo via the
new model; garden half of `src/canvas/drag/*` deleted.

## SP3 — Nursery canvas → SceneCanvas (SUMMARY — own spec later)

**Goal.** `NurseryScene = Scene<NurseryNodeData, NurseryLayer, …>`: trays as containers, seedlings
as leaves, inch-based poses, cell-grid layout, custom painters. Port the fill-tray and seedling-move
gestures (`useFillTrayTool`, `useSeedlingMoveTool`, `useSeedSelectTool`, `usePaletteDropTool`) onto
the action model. Delete the nursery half of `dragPreview`.

**Ship gate.** Visual + behavioral parity for the nursery; nursery half of `src/canvas/drag/*`
deleted.

## SP4 — Decommission & track HEAD (SUMMARY — own spec later)

**Goal.** Remove the now-dead infrastructure and cut the pin.
- Delete `src/canvas/drag/` (putativeDrag, dragPreviewLayer, useDragController, all `*Drag.ts`),
  the `dragPreview` slot + `setDragPreview` in `uiStore`, `src/store/history.ts`, dead adapters.
- Migrate clipboard: `useClipboard` → `useClipboardOps` (or a small custom copy/paste on the Scene).
- Repoint `eric/node_modules/@orochi235/weasel` at weasel HEAD permanently; remove the
  `~/src/weasel-eric-pin` worktree; delete the `weasel-pin` memory note.

**Ship gate.** Full suite + visual + optimizer-boundary green on weasel HEAD with no pin.

## Risks & mitigations (epic-level)

- **Undo-model swap (SP1)** is the riskiest single step: eric's snapshot undo (coarse, whole-Garden
  `structuredClone`) becomes fine-grained Scene ops. Mitigation: SP1 ships behind a no-visible-change
  gate with explicit undo/redo parity tests before any gesture work.
- **Behavior fidelity (SP2/SP3):** eric's gesture behaviors are bespoke; weasel's layout/behavior
  surfaces may not cover every case 1:1. Mitigation: visual-regression suite as the gate; port one
  gesture end-to-end first within SP2 to validate the behavior-mapping before doing the rest.
- **`gardenStore` reader sprawl (SP1):** hundreds of call sites. Mitigation: temporary selector
  facade preserving the current `gardenStore` read API; migrate readers opportunistically, not all
  at once.
- **Pin coexistence:** between SP0 and SP2, eric still runs on the pin; only SP4 cuts over. Keep the
  pin working throughout.
