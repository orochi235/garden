# Phase 7 (kit gesture adoption) — BLOCKED on weasel; findings + decision (2026-06-15)

> Written overnight after Mike asked to "try 7 and 8." Phase 7 cannot land without a
> weasel-side change. This doc records the verified blocker, the full behavior-mapping
> audit (valuable regardless), and the decision Mike needs to make. **No eric code was
> changed for Phase 7** — Phase 6 (garden on `<SceneCanvas>`, vendored tools as takeover)
> stands as the verified, functional state.

## TL;DR — the blocker (verified directly, not via agent claim)
- The weasel symlink is on **`main` = `@weasel-js/core@0.3.0`, post-"Phase 14e"**: the legacy
  `useMove`/`useResize`/`useAreaSelect` hooks are **gone** (`find src -name useMove.ts` → empty),
  and the kit select tool's drag is owned by the **gesture dispatcher → `moveAction`**.
- `useSelectTool` declares `move?: unknown` with the comment **"Ignored after Phase 14e Task 3 —
  `moveAction`…"** (`src/tools/builtin/select/useSelectTool.ts:57-59`). The legacy move/areaSelect
  option fields (incl. `behaviors`) are **not consumed**.
- `moveAction` (`src/interactions/actions/defaults/move.ts`) is **translate-only**; its own doc says
  the **"Behavior pipeline (snap-to-grid, snap-back-or-delete, etc.) via `opts.behaviors`"** is a
  **"Phase 7 TODO"** (lines 28, 32-33). So snap/layout/container-snap are NOT wired into the move
  the kit select tool actually runs.
- `snapToContainer`/`snapToGrid`/`snapBackOrDelete` DO exist and ARE exported from
  `@orochi235/weasel/move` — but nothing on `main` feeds them into `moveAction`. The behaviors are
  orphaned relative to the dispatcher move path.

**Consequence:** adopting the kit select tool for move/resize on this weasel build yields a
translate-only move with no container snap, no cell-grid slot snap, no snap-back, no cursorInside
drop guard, no slot-aware reparent — i.e. it would **regress eric's entire planting-drag model.**
This is the same "HEAD Action-API adoption" the migration design's **Out-of-Scope** section already
deferred ("eric keeps its vendored gestures; the declarative `moveAction`/etc. are `@experimental`").

eric currently **builds and passes 826 tests / 4/4 visual** against this dist — Phase 6 is fully
functional. The blocker is strictly about *retiring* the vendored gestures, not about today's build.

## The decision for Mike (Phase 7 cannot proceed without one)
1. **Defer Phase 7 (recommended for now).** Phase 6 already delivered the core motivation (eric off
   the bare `<Canvas>` weasel is retiring). Keep eric's vendored gestures (takeover tools) as the
   terminal gesture state until weasel completes its own "Phase 7 TODO" (wire `opts.behaviors` +
   snap + layout + slot-aware reparent into `moveAction`). Then revisit eric-side adoption. Low risk,
   no lost behavior. The ~2558 LOC deletion is cleanup, not a blocker on anything.
2. **Do the weasel-side `moveAction` behavior-pipeline wiring** (weasel is yours; hold for your
   sign-off like `loadState`/the align fix). This is weasel's roadmap item, touches the
   `@experimental` Action API, and needs real parity testing for eric's complex planting-drag — a
   supervised joint effort, not an overnight autonomous change. After it lands, eric-side adoption
   becomes the configure-via-behaviors task the table below describes.
3. **eric adopts the incomplete Action API now and re-implements snap/layout eric-side** as new
   Action behaviors. Highest risk; re-treads what eric vendored to avoid; not recommended.

## Behavior-mapping audit (the Phase 7 plan, once unblocked)
Once weasel's `moveAction` consumes a behavior pipeline (option 2), this is the eric-side wiring.
Eric's `gestures/behaviors.ts` header confirms its `snapToGrid`/`snapBackOrDelete`/`selectFromMarquee`/
`cloneByAltDrag` were **vendored from the kit**, so the kit versions drop back in.

**DIRECT / CONFIGURE (clean mappings):**
- Click-to-select, shift/meta extend, empty-click-clear → kit select-tool classifier (DIRECT; supply
  `geometry.pickEvery = adapter.hitAll→ids`, `boundsOf = adapter.getBounds`).
- Marquee → `areaSelect.behaviors=[selectFromMarquee()]` (vendored-from-kit drop-in; needs
  `hitTestArea`+selection adapter methods).
- Move → kit move + `move.behaviors=[snapToGrid(...), snapToContainer({findTarget: adapter.findSnapTarget,
  dwellMs:0, isInstant}), snapBackOrDelete({radius:Infinity, onFreeRelease:'snap-back'})]`; group drag via
  `move.expandIds = expandToGroups`; cell-grid slot snap via `adapter.getLayout = plantingLayoutFor`.
- Snap-to-grid (structures/zones), snap-back → kit behaviors (vendored-from-kit), wrapped for eric's
  structure/zone gating + per-structure opt-out.
- Resize (corner handles) → kit `useResize`/`resizeAction`; handle hit-test via kit
  `cornerResizeHandles`/`hitCornerHandle` (still exported). Single-selection (matches eric).
- Alt-drag clone → `useClone({behaviors:[cloneByAltDrag()], expandIds})` + eric's insert adapter
  (hook path; the descriptor `cloneAction` path loses container-aware paste + expandIds).

**BAD-FIT (stay eric-custom/vendored under either API — surface per behavior):**
1. **The move-commit pipeline itself** — blocked until weasel wires `moveAction.opts.behaviors` +
   `getLayout` layout pass + slot-aware reparent (the central blocker above).
2. **cursorInside drop guard** — kit `snapToContainer.onEnd` commits any attraction-only release that
   eric's `requirePlantingDrop` rejects. Keep `requirePlantingDrop` as a custom `MoveBehavior` ordered
   after `snapToContainer`. Cheap; no kit change.
3. **`clampStructureZoneToGardenBounds`** — no kit equivalent; custom `MoveBehavior`.
4. **`detectStructureClash` (`dragClashIds`)** — no kit "non-blocking overlap warning"; custom behavior.
5. **Alt-click cycle through overlapping (`useEricCycleTool`)** — NO kit knob (verified: no cycle/
   stack-cycle in weasel; `pickBest(alt)` param exists but nothing consumes it). Keep the ~170 LOC
   `useEricCycleTool` as a separate registered tool. Cleanest surviving vendored controller.
6. **Per-member group transforms** — both eric's vendored `useMove` and the kit run `onMove` only on
   the primary id (secondaries inherit the delta). Shared limitation; tracked in
   `docs/canvas-kit/TODO.md` Tier 1.5. Not a regression.
7. **Clone on descriptor path** — `main`'s `cloneAction` lacks alt-gating/`expandIds`/container-aware
   paste; use the hook clone path (BAD-FIT until weasel wires it).
8. **Slot-aware reparent vs z-order reparent** — `main`'s `reparentOnDrop:'top'|'above'` is z-order,
   not eric's cell-grid `commitDrop` (preserves local coords + slot). Use the layout-`commitDrop` path.

**Adapter survival (`src/canvas/adapters/gardenScene.ts`):** cannot be retired — slim it to a
callback bag (`findSnapTarget, getBounds, hitAll/pickEvery, hitTestArea, getLayout, getPose, setPose,
getParent, getChildren, getSelection, setSelection, applyOps`) feeding the kit knobs + the surviving
cycle tool. What dies (only after adoption): the vendored controllers in `src/canvas/gestures/`
(~2558 LOC) + the `src/canvas/drag/*` overlay façade (replaced by `usePreviewGhostLayer`).

## Why I stopped here (overnight, autonomous)
Option 2 (the only path that actually completes Phase 7) requires a substantial change to weasel's
`@experimental` Action API — weasel's own roadmap item — whose eric-side parity (complex planting-drag)
can't be verified by the automated gates (the visual suite is static; eric's gesture unit tests cover
the *vendored* tools, not the kit path). Doing it unsupervised would produce an unverifiable, likely-
broken change on top of an experimental API. Per the established "hold weasel changes for Mike's
sign-off" pattern (loadState, align fix), this is a supervised decision, not an autonomous deletion.

## Key files
- weasel: `src/tools/builtin/select/useSelectTool.ts:57-59` (move ignored post-14e),
  `src/interactions/actions/defaults/move.ts` (translate-only `moveAction`, "Phase 7 TODO"),
  `src/interactions/actions/move/behaviors/{snapToContainer,snapToGrid,snapBackOrDelete}.ts` (exist,
  exported from `/move`, orphaned from the dispatcher move).
- eric: `src/canvas/tools/useEricSelectTool.ts`, `useEricCycleTool.ts`, `src/canvas/gestures/*`,
  `src/canvas/adapters/{gardenScene,plantingLayout,findSnapContainer}.ts`, `src/canvas/drag/*`.
- Prior: `2026-06-15-phase6-done-handoff.md`, `specs/2026-06-14-garden-scenecanvas-migration-design.md`
  (Out-of-Scope: "HEAD Action-API adoption … deferred").
</content>
