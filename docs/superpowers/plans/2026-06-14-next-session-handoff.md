# Next-session handoff — snap-back bug + weasel-alignment audit (2026-06-14)

> Written at the end of the weasel-HEAD cutover session (context got large). The cutover is **done and
> green on `main`**; this captures the two follow-on asks so a fresh session starts fully informed.

## Current state (all committed on `main`)
- eric runs on weasel **HEAD** (`~/src/weasel` @ `6e11250e`). All gates green: `tsc -b` 0 eric-source
  errors, `npm test` 790 pass, `npm run lint` clean, `check:optimizer-boundary` clean, `npm run
  test:visual` 4/4.
- Dev server may still be running at **http://localhost:53305/garden/** (vite, background). If not:
  `cd ~/src/eric && npm run dev`.
- Key docs: `docs/superpowers/plans/2026-06-13-head-api-mapping.md` (HEAD→eric API mapping),
  `…-followup-head-action-api-adoption.md` (deferred Action-API adoption + world-layer cleanup).
- Architecture notes live in the `weasel-pin` auto-memory. TL;DR: eric keeps its OWN `defineTool`
  framework; the removed gesture hooks were **vendored** into `src/canvas/gestures/` (~2560 LOC);
  eric keeps a scalar uniform-zoom `View` with `toKitView`/`fromKitView` converters; eric's 31
  self-transforming layers are marked `space:'screen'` to opt out of HEAD's world-layer auto-wrap.

## TASK 1 — Fix: failed/invalid planting drop must snap back to origin (not commit an "odd pose")

**Symptom (Mike, live app):** dragging a planting and releasing on an INVALID drop (no valid layout
slot) leaves it at the raw cursor position ("an odd place in the container") instead of snapping back
to where it was. Suspected worst for the **single-plant** layout (`{type:'single'}`, whose only valid
slot is the container CENTER).

**Confirmed:** NOT a weasel/HEAD API mismatch — the whole path is eric's own code, unchanged by the
cutover. This is an eric-side drop-validity gap.

**The commit-pose resolution path** (`src/canvas/gestures/move.ts`, `onEnd` ≈ lines 500–565), in order:
1. Run move behaviors' `onEnd`. `requirePlantingDrop` (`src/canvas/tools/snapMoveBehaviors.ts`) wraps
   the vendored `snapBackOrDelete` (`src/canvas/gestures/behaviors.ts`) with `radius:Infinity,
   onFreeRelease:'snap-back'`. It returns `null` (→ abort/snap-back) when the release has **no snap
   target** — driven by `ctx.snap`, which `trackPlantingSnap` mirrors from
   `plantingMove.findSnapTarget` → `findSnapContainer`. Returns `undefined` (defer) when a snap target
   exists.
2. If a behavior returned ops, use them. If `null` → snap-back. If `undefined` → continue.
3. If `undefined` AND `layoutPass.layout && layoutPass.container && draggedIds.length===1`: call
   `plantingLayout.commitDrop(...)` with `accepted ? target : null`. `commitDrop` returns `[]` when
   `target===null` (→ no transform op → stays at origin = snap-back).
4. **RAW-POSE FALLBACK:** if `ops===undefined` still, commit `origin→current` (the cursor pose). ← the
   likely "odd place" source: this runs only when the layout-pass block in step 3 was SKIPPED.

**The ambiguity to resolve by live repro:** statically, single-plant *should* either center (accepted
target = center slot) or snap back (no snap target / target null). The odd-pose must come from either
(a) the step-4 raw fallback firing because `layoutPass.{layout,container}` weren't set for that drag,
or (b) a disagreement between the two snap mechanisms — `findSnapTarget`/`findSnapContainer` (drives
snap-back) vs `plantingLayout.getDropTargets`+`nearestSlotSnap.pickTarget` (drives the committed
target). Reproduce in the live app (drag the lone plant of a single-plant container to an invalid
spot), add logging in `move.ts` `onEnd` to see which branch commits and what `layoutPass`/`ctx.snap`
hold, THEN fix at root cause. Likely fix: make "no accepted valid slot" snap back to `origin` rather
than fall through to the raw-pose commit (e.g. tighten `requirePlantingDrop`'s condition, or make the
step-4 fallback snap-back for plantings, or have single-plant `getDropTargets`/`commitDrop` force the
center slot or origin). Add/extend a unit test in `snapMoveBehaviors.test.ts` / a move-controller test
before fixing (TDD). Relevant: `src/model/layout.ts` (`getSlots` single → container center),
`src/canvas/adapters/plantingLayout.ts` (`getDropTargets`/`commitDrop`/`contains`/`nearestSlotSnap`),
`src/canvas/adapters/plantingMove.ts` (`findSnapTarget`/`getLayout`/`getParent`/`setParent`).

## TASK 2 — Audit: other gaps + places to better align with weasel HEAD

Broad sweep (good fit for a multi-agent workflow — Mike opted into orchestration for this work).
Known starting points:
- **Canvas labels never render** (CONFIRMED pre-existing, not the migration): eric never calls
  `registerFont`; every match is a `// Flagged: text commands require registerFont() wired at app boot`
  comment (in structure/zone/planting/tray/seedling/debug/selection layer files). HEAD text needs a
  registered font atlas: `registerFont(family, variant, metricsUrl, atlasUrl)` — the kit ships
  `/fonts/inter/inter.json` + `inter.png` (see `~/src/weasel/src/renderer/draw.test.ts`). Wiring this
  at app boot would make all the `*-labels` layers actually draw. Pin baseline `garden-mixed.png`
  confirms labels never drew.
- **Idiomatic world-space layers:** eric marks 31 layers `space:'screen'` and keeps its own
  `viewToMat3` (in `src/canvas/util/weaselLocal.ts`) to opt out of HEAD's auto-wrap. HEAD's
  `viewToMat3` is mathematically identical and `drawLayers` auto-wraps `space:'world'` layers — so the
  cleaner alignment is to drop the manual `viewToMat3(view)` wrap, return world coords, and remove the
  local reimpl. (Tracked in the follow-up SP.)
- **Vendored gestures → HEAD Action API:** `src/canvas/gestures/` (~2560 LOC vendored from the pin) vs
  HEAD's `moveAction`/`resizeAction`/`cloneAction`/`areaSelectAction` + dispatcher. Full plan in
  `…-followup-head-action-api-adoption.md`. Deleting the vendored layer + bespoke `src/canvas/drag/*`
  + `uiStore.dragPreview` is the deferred H4 teardown.
- **Other candidates to look for in the audit:** other `// Flagged:` / TODO markers referencing kit
  features not wired; eric reimplementations of now-public kit helpers (e.g. `computeFitView` vendored
  over `fitZoom`, `viewToMat3`); adapters still hand-rolled where `sceneToAdapter`/scene-history could
  apply (SP1 deliberately kept the Zustand store + snapshot history — confirm that's still desired);
  the clipboard `cut` shim in `App.tsx` (group-expansion/nursery-aware cut deferred); the 4 inert
  `weasel-history` TS2307 dist-packaging leaks (weasel-side fix).

## Deferred (not blocking)
- Drop the pin worktree `~/src/weasel-eric-pin` (kept as escape hatch + vendoring source until the
  cutover is reviewed/merged).
- weasel-side: fix the `weasel-history` dts packaging leak (4 inert TS2307).
