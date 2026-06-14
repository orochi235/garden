# Handoff — SceneCanvas pivot + canvas-text root cause + TASK 2 audit (2026-06-14)

> Written at high context near the end of a long session. Supersedes the open items in
> `2026-06-14-next-session-handoff.md` (its TASK 1 is **done**; its TASK 2 is **done** — see below).
> The headline is a **direction change**: eric should migrate from the bare `<Canvas>` to `<SceneCanvas>`
> (Mike's call this session), which is also the real fix for canvas text never rendering.

## Shipped this session (committed on `main`)
- `3a4c30e` fix(canvas): snap planting back on attraction-only release (handoff TASK 1; + regression test).
- `241a4c7` fix(canvas): repaint nursery canvas during drags — seed-starting drag ghost + bulk-drop
  affordances were frozen because `NurseryCanvas` `layers` memo lacked `dragPreview`/data deps.
- `067b11b` fix(canvas): let planting drag ghost leave its source cell-grid bed (`poseInsideContainer`
  guard in the move-ghost cell-snap in `useEricSelectTool.ts`).
- All gates green at each step (`tsc -b` 0 eric-source errors, `npm test` 791, lint, optimizer-boundary,
  `test:visual` 4/4). Auto-memory `weasel-pin.md` corrected (symlink → HEAD, not the pin).

## Uncommitted in the tree (a DEAD-END font shim — decide whether to keep)
- `M src/main.tsx` — adds `await registerFont('sans-serif', {weight:400,style:'normal'}, …)` from
  `@orochi235/weasel/renderer`, atlas under `public/fonts/inter/`.
- `?? public/fonts/inter/{inter.json,inter.png}` — copied from `~/src/weasel/assets/fonts/inter/`.
- `M biome.jsonc` — excludes `public/fonts/**` from biome (atlas json isn't ours to format).
- **This does NOT work** (see root cause). The atlas + a registerFont call are probably still wanted
  post-migration, but the *import/registry path* must change. Don't commit as-is.

## THE PIVOT — text labels never render → eric is on the wrong canvas component

**Symptom:** no canvas text renders anywhere (tray labels, planting/structure/zone labels). Confirmed
live: a selected planting draws its label *background* rect (`rgba(0,0,0,0.6)`) but the white glyphs
inside are silently dropped.

**Why the font shim failed (root cause — dual font-registry across dist bundles):**
- eric renders through the **bare `<Canvas>`** (`CanvasNewPrototype.tsx:494`, `NurseryCanvas.tsx`), which
  internally constructs a `WeaselRenderer`. Both come from the kit's **main barrel** bundle `dist/index.js`,
  which contains **its own copy** of the font registry module.
- `registerFont` is exported **only** from the `@orochi235/weasel/renderer` subpath → `dist/renderer.js`,
  which has a **second, separate copy** of the registry Map.
- So `registerFont` populates renderer.js's registry while the bare-Canvas renderer reads index.js's
  registry. They never meet → `resolveFontVariant('sans-serif',400,'normal')` finds nothing at draw time
  → glyphs dropped, **no error/warn** (registration itself "succeeds"). Atlas fetch/decode is fine
  (json 200, png → 341×326 ImageBitmap). `registerFont` is **not** exported from the main barrel
  (only a doc-comment) — Mike: "we deliberately weren't exporting that anymore."
- The kit **demo** renders text fine because it imports everything from `../src` (single registry); the
  split only exists in the built `dist/`.

**Mike's decision:** eric **should 1000% be using `<SceneCanvas>`**, not the bare `<Canvas>`. That is the
supported consumer surface (owns the renderer + text/font wiring + the `selectionOverlay`/`dispatcherOverlay`/
`previewGhost` slots the audit flagged as the Action-API blocker).

## SceneCanvas migration — scoping (what I verified in `~/src/weasel/src/canvas/SceneCanvas.tsx`)
- SceneCanvas **wraps the same `./Canvas`** and **forwards a consumer `tools={useTools(...)}` as-is**
  (file doc lines 9-12) and **deep-merges a user `layers` map with kit defaults** (`mergeLayers`, ~line 211).
  → Strongly suggests a **contained swap**: eric keeps its `defineTool` tools (passed via `tools`) and its
  bespoke world/screen `RenderLayer`s (passed via `layers`), and gains the correct renderer + overlay slots.
  Confirm against `SceneCanvas.tools.test.tsx` / `SceneCanvas.test.tsx`.
- **CAUTION — SceneCanvas alone does NOT fix the font, by itself.** It uses the same `index.js` renderer/
  registry, and `registerFont` still lives only in renderer.js's separate registry. So the **font fix is
  weasel-side** (Mike controls weasel): either (a) export `registerFont` from the **main barrel** sharing
  the renderer's registry, or (b) hoist the font registry into a **shared dist chunk** so `index.js` and
  `renderer.js` reference one Map. **Resolve the SceneCanvas font-registration story first** (does SceneCanvas
  auto-register a default? expose a font prop? or just needs registerFont reachable on the right registry?),
  then eric registers the Inter atlas on the correct registry.
- SceneCanvas brings kit contexts (`ActionsProviderIfRoot`, `PointerProviderIfRoot`, selection context).
  eric already wraps canvases in `ActiveToolContextProviderIfRoot` (`CanvasNewPrototype.tsx:59`). Watch for
  provider double-wrapping / whether SceneCanvas wants to OWN selection vs eric's `uiStore.selectedIds`.

## Provenance — who chose the bare `<Canvas>` (Mike asked)
It was **not an explicit Mike decision to reject SceneCanvas.** eric was *already* on the bare `<Canvas>`
from the prototype-canvas era (pre-HEAD-cutover). During the cutover a prior planning session **discovered**
this and **defaulted to keeping it** to minimize disruption:
- `head-api-mapping.md:184` — *"SceneCanvas vs eric's own Canvas? — decide in H2 … **default to keeping
  eric's Canvas + manual context wiring** (less disruptive to the bespoke world-space layer painters)."*
- `followup-head-action-api-adoption.md:12` — *"Mid-cutover we **discovered** eric does not use HEAD's
  SceneCanvas/useGestureDispatcher."*
Mike's *explicit* decisions (`head-api-mapping.md:104`, `sp2-sp4-head-cutover-plan.md:5`) were the **coupled
cutover** and **vendoring the 4 gesture controllers** — both downstream of, and compatible with, the
bare-Canvas default, but the bare-Canvas-vs-SceneCanvas question itself was an **agent default, never put to
Mike as a decision.** This session reverses that default.

## TASK 2 — weasel-HEAD alignment audit (DONE — multi-agent, 13 agents, all claims verified)
Full prioritized report was delivered in-session (ephemeral; re-run the audit workflow to regenerate). Mike's
two decisions this session: **`fitToBounds` padding-semantics change is fine**; **adopting `@experimental` kit
surface is fine** (he controls weasel). Tiers:
- **Quick wins:** wire fonts (now folded into the SceneCanvas migration); delete local `viewToMat3`
  (byte-identical to public export — migrate all **8** importers first); add a single-undo group-cut test to
  the clipboard shim; doc/state hygiene + drop the idle `~/src/weasel-eric-pin` worktree.
- **Medium:** flip **~31** false `space:'screen'` layers → `space:'world'` (drop the manual wrap; keep the 3
  genuine screen layers: selection-handles, debug-all-handles, system-origin); `computeFitView` → public
  `fitToBounds`; weasel-history `.d.ts` leak (**6** files, weasel-side).
- **Big/deferrable:** gesture Action-API teardown — blocked on the **unexported** preview-ghost/overlay
  layers; the SceneCanvas migration likely *unblocks/overlaps* this since SceneCanvas owns those slots. If
  adopting an action, start with `areaSelectAction`.
- **KEEP (verified non-issues):** `toKitView`/`fromKitView`, `hitTest.ts` helpers, hand-rolled adapters +
  Zustand snapshot history, and **no `@internal`/`@experimental` leak in current eric code**.

## Recommended first steps next session (fresh context)
1. **Brainstorm/plan the SceneCanvas migration** (use the brainstorming skill — this reverses a documented
   decision and is multi-file). Map `SceneCanvas` props ↔ eric's two `<Canvas>` callsites
   (`CanvasNewPrototype.tsx` garden + `NurseryCanvas.tsx`).
2. **Settle the two unknowns before coding:** (a) does SceneCanvas cleanly host eric's `defineTool` tools +
   custom `layers` without forcing the dispatcher/Action model? (read the `SceneCanvas.*.test.tsx` suite);
   (b) what is the **font-registration path for SceneCanvas consumers**, and what weasel-side packaging change
   makes `registerFont` hit the renderer's registry?
3. **Garden first, then nursery** (smaller, mirrors the cutover sequencing). Visual-gate each step.
4. Decide the fate of the uncommitted font shim once (2) is answered.

## Key files
- eric canvas hosts: `src/canvas/CanvasNewPrototype.tsx` (garden, bare `<Canvas>` @ :494), `src/canvas/NurseryCanvas.tsx`.
- weasel: `~/src/weasel/src/canvas/SceneCanvas.tsx` (+ `SceneCanvas.*.test.tsx`), `~/src/weasel/src/canvas/Canvas.tsx`,
  `~/src/weasel/src/features/text/atlas/registerFont.ts`, dist split `dist/index.js` vs `dist/renderer.js`.
- Plans: `2026-06-13-head-api-mapping.md`, `…-followup-head-action-api-adoption.md`, `…-sp2-sp4-head-cutover-plan.md`.
