# Project TODO

Backlog of work that's been considered but not scheduled. Add new items at the bottom of the relevant section.

## Refactors

### Repeatable putative-drag framework

**Phase 1 landed** — `Drag<TInput, TPutative>` interface, `useDragController` hook, `dragPreview` slot on `uiStore`, generic `dragPreviewLayer`, and the seed-mode sow-cell / fill-tray drag migrated. See `src/canvas/drag/` and the seed-fill-tray migration in `src/canvas/tools/usePaletteDropTool.ts`.

Coexistence notes (Phase 1):
- Legacy slots `seedFillPreview`, `seedMovePreview`, and `dragOverlay` remain on `uiStore`. The migrated seed-fill-tray drag mirrors its putative into `seedFillPreview` via `Drag.onPutativeChange` so the existing `seedling-fill-preview` render layer keeps drawing without changes.
- The new `drag-preview` render layer is registered on `SeedStartingCanvasNewPrototype`; the seed-fill-tray drag's `renderPreview` is a no-op while the legacy fill-preview layer is the canonical renderer. Future-migrated drags will own their own rendering.

**Phase 2+ TODO** — migrate remaining drags onto the framework, in this order:
- palette → garden plant-drop (`useGardenPaletteDropTool`)
- move (single + multi) — currently lives in weasel's `useMove` + `useEricSelectTool` move pipeline
- resize — `useEricResizeTool`
- plot (rectangle drag) — `useInsertTool`
- area-select marquee — `useEricSelectTool` (already shows a marquee but it's separate from the framework)
- seed-mode multi-seedling move (`useSeedlingMoveTool` + `seedMovePreview`)

Each migration should:
1. Define a `Drag` in `src/canvas/drag/<name>Drag.ts`.
2. Move the drag's `renderPreview` to draw via the framework (and delete the corresponding legacy preview layer once safe).
3. Drop the drag's bespoke document-level pointer pipeline in favor of `useDragController.start()`.
4. Remove the corresponding legacy slot from `uiStore` once no consumer remains.

Watch out for:
- Modifier keys (shift, alt, cmd) need to update the preview without further pointer movement — the existing seed handler already has `keydown`/`keyup` listeners; that pattern generalizes.
- Some drags (move, resize) already mutate the store mid-flight via `commitPatch`-style undo wrapping. Putative compute should NOT mutate; only `commit` should.
- Render performance: most layers redraw on store changes; preview updates fire many times per second. The seedling layer's invalidation already handles this fine, but scaled up to all drags it may need throttling or a dedicated preview canvas.

## canvas-kit / weasel

Backlog for the kit lives at [`docs/canvas-kit/TODO.md`](canvas-kit/TODO.md) so it travels with the kit when it splits out into the `@orochi235/weasel` repo. Add kit-specific items there, not here.

## Canvas redesign deferrals (Phase 1)

- ~~`gardenSceneAdapter.findSnapTarget` is a no-op for structure and zone nodes. Once Phase 2 wires drag-to-move on structures/zones, decide whether to add a grid-snap branch or accept free positioning.~~ Resolved: grid-snap for structures/zones is handled by `snapStructureZoneToGrid` in `useEricSelectTool.ts`, not via `findSnapTarget`. `findSnapTarget` correctly returns null for non-plantings. Updated `snapStructureZoneToGrid` to honour the `snapToGrid` boolean on structures (`false` → free move); zones have no such flag and default to grid-snap.
- ~~`gardenSceneAdapter.setParent` for plantings recomputes local from current world pose to preserve visual position, but `gardenStore.updatePlanting` runs `rearrangePlantings` whenever `parentId` changes, which overwrites those local coords. Decide whether kit-driven drag-and-drop reparenting should bypass arrangement, defer to it, or get a new "manual position" path.~~ Resolved: `updatePlanting` accepts an optional third arg `{ skipRearrange?: boolean }`; `gardenSceneAdapter.setParent` passes `{ skipRearrange: true }` so explicit local coords survive. All other callers are unchanged and still trigger rearrangement.

## Canvas redesign deferrals (Phase 2)

- ~~Seedling and tray layers were not converted in Phase 2. They still live as legacy `SeedlingLayerRenderer`/`TrayLayerRenderer` and are not registered in `CanvasNewPrototype`. Phase 4 should port them to world-coord `RenderLayer`s alongside the gutter-affordance refactor.~~ Resolved: `seedlingLayersWorld.ts` and `trayLayersWorld.ts` implement world-coord `RenderLayer`s and are registered in `SeedStartingCanvasNewPrototype`. No legacy `SeedlingLayerRenderer`/`TrayLayerRenderer` exist in the codebase; they were never created as standalone classes. The gutter-affordance refactor remains a separate open deferral (see Phase 4 bullets above).
- System layer (origin marker, axes, grid debug) not converted. Decide in Phase 3 whether the new prototype needs a counterpart or if it stays legacy-only.
- `hitTest.ts` and `seedStartingHitTest.ts` were left alone in Phase 2 because their math was already mostly world-coord; the spec called for an explicit conversion + tests to confirm. Do that pass when wiring gestures in Phase 3.
- ~~Highlight pulse and flash are still imperative in `uiStore`/per-layer state. Move to a single Zustand-backed `highlightOpacity` value driven by a shared rAF tick when porting selection gestures (Phase 3).~~ Resolved: `useHighlightStore` is the canonical Zustand store for all flash/hover state; a shared rAF tick bumps `pulse` once per frame while any flash or hover is active and self-terminates when idle. `getMaxOpacity()` aggregates across all active ids and is synced into `uiStore.highlightOpacity` via a store subscriber so single-channel consumers stay current. Layers call `computeOpacity(id)` directly for per-id granularity.
- ~~`CanvasNewPrototype` hardcodes `highlightOpacity: 0` and `showFootprintCircles: true`. Wire to real ui state once Phase 3 introduces toggles.~~ Resolved: `uiStore` now exposes `highlightOpacity` (default 0) and `showFootprintCircles` (default `true`); `CanvasNewPrototype` reads both from the store.
- Selection rendering reads from `uiStore.selectedIds` but selection editing/gestures aren't wired (`selectionMode="none"`). Phase 3 connects palette/drag/click → adapter.
- Label de-occlusion in `planting-labels` uses world-coord rects; the legacy version used screen rects. Visually verify behavior matches once labels are turned on at varied zoom levels (Phase 3).
- `vite.config.ts` gained `resolve.dedupe: ['react', 'react-dom']` to fix duplicate-React errors when consuming linked weasel. Once weasel ships as a published package this dedupe is still safe but no longer load-bearing; revisit if it causes issues.

## Canvas redesign deferrals (Phase 3)

- ~~Highlight pulse is aggregated as `max(computeOpacity(id))` over the selected set and threaded into layers as a single `highlightOpacity` number. Per-id pulsing (so two flashing entities can ramp independently) is a Phase 5 refinement.~~ Resolved: per-id pulsing is fully implemented — `useHighlightStore` keys every flash by entity id; layers call `computeOpacity(id)` per entity so two simultaneously flashing entities ramp independently. `getMaxOpacity()` provides the aggregate for single-channel consumers. See `src/store/highlightStore.ts` and `docs/behavior.md` "Per-id selection-flash opacity".
- ~~Alt+drag clone behavior was dropped from `useEricCycleTool` — alt currently only cycles topmost-stack on click. If we want alt-drag-to-duplicate parity with the legacy canvas, wire kit's `useClone`/`useDuplicate` behind a dedicated tool in Phase 4/5.~~ Resolved: `useEricCycleTool` now accepts an optional `insertAdapter`; when alt+drag follows a cycle-click, the gesture delegates to `useClone(cloneByAltDrag())`, duplicating the selected object at the drop position. `CanvasNewPrototype` passes `insertAdapter` to the cycle tool. See `src/canvas/tools/useEricCycleTool.ts` and `docs/behavior.md` "Alt+drag clone (2026-05-05)".
- ~~`CanvasNewPrototype` still hardcodes `showFootprintCircles: true` because no `useUiStore` flag exists for it. Add a toggle in the Plantings sidebar section if/when needed.~~ Resolved: see Phase 2 bullet above. Sidebar toggle remains a future addition.
- ~~Insert tool (kit's `useInsertTool` + `InsertAdapter`) is not wired. Palette drags from the sidebar still flow through the legacy `useDragLayout` path. Phase 4 will plumb insert through the new tools registry.~~ Resolved (2026-05-05): `useInsertTool(insertAdapter, ...)` is registered in `CanvasNewPrototype` and activates when `plottingTool` is set. Garden palette drags route through `useGardenPaletteDropTool` (the refactored successor to the legacy `useDragLayout` path, landing in earlier work); the draw-mode rectangle-drag route uses `useInsertTool`. See `src/canvas/adapters/insert.ts` and `docs/behavior.md` "Insert-tool routing and clipboard wiring (Phase 4, 2026-05-05)".
- ~~Paste/clipboard (kit's `useClipboard`) is not wired into the new prototype. Defer until Phase 4 alongside insert.~~ Resolved (2026-05-05): `useClipboard(insertAdapter, ...)` is wired in `App.tsx`; Cmd/Ctrl+C, Cmd/Ctrl+X, Cmd/Ctrl+V dispatch through `useKeyboardActionDispatch` via the actions registry. Cut is a single undoable batch (snapshot + delete + deselect). See `src/components/App.tsx` and `docs/behavior.md` "Insert-tool routing and clipboard wiring (Phase 4, 2026-05-05)".
- Snap behaviors (`snapToGrid`, `snapToContainer`, `snapBackOrDelete`) are not yet attached to `useMove` options. Phase 5 will compose them once the snap-back UX is ported.
- `seedStartingHitTest.ts` is still screen-space and untouched — only used by the seed-starting view, which is Phase 4 work.
- `structureLayersWorld.ts` clamps `rimWidth`/`wallWidth` to half the structure dimension and skips pattern overlays when inner extent ≤ 4 world units. Tiny structures will render without the inner pattern overlay; revisit if that's visually objectionable when zoomed way in.
- `useEricSelectTool.pointer.onClick` clears selection on a no-drag click in empty space (drag.onEnd never fires when the user doesn't move the pointer). Verify this matches legacy click-to-clear semantics across modifier combinations.
- Wheel zoom from kit's `useWheelZoomTool` was wired but not visually verified — the Playwright dispatched-WheelEvent didn't change zoom in our smoke test. May require a modifier (ctrl/meta) by kit default; check kit options if real-mouse scroll doesn't zoom.
- Label de-occlusion visual check at varied zoom levels was not exhaustively performed; the prototype renders labels but a side-by-side comparison against the legacy canvas at low/medium/high zoom is still TODO.
- The pre-existing nested `<button>` hydration warning in `LayerSection` > `ToggleSwitch` is unrelated to the canvas redesign but surfaces in the new prototype's console. Track separately.

## Canvas redesign deferrals (Phase 4)

- ~~`seedStartingScene` adapter places every tray's world origin at `(0, 0)`.~~ Resolved in v1 multi-tray auto-flow (2026-05-04): `trayWorldOrigin(tray, ss)` lays trays out left-to-right in insertion order with a `TRAY_GUTTER_IN = 6` gutter; no per-tray `(x, y)` field is added (computed from the running sum of prior widths). `seedStartingWorldBounds` returns the union AABB. Single-tray gardens are byte-identical and origin remains `(0, 0)`.
- `seedStartingScene.setParent` is a no-op. Cross-tray drag-to-reparent is not part of the seed-starting flow today; if we ever want it, route through `removeSeedling`/`addSeedling` or a new store action that preserves cell identity.
- `seedStartingScene.setPose` requires the dragged seedling to already live in a tray (uses `store.moveSeedling` which only swaps within one tray). Inserting a brand-new seedling via the move pipeline isn't supported — that's an `InsertAdapter` concern for the future seed-starting insert tool.
- Gutter handling (drag-spread affordances along tray edges) deliberately omitted from `SeedNode`. A parallel sub-task owns the design decision; once resolved, add a `GutterNode` kind and re-introduce `hitTestDragSpreadAffordance` integration.
- ~~`seedStartingHitTest.ts` still exposes the original screen-space `hitTestCell` used by `CanvasStack.tsx` and `App.tsx`.~~ Resolved in Phase 5: screen-space helpers and `getTrayViewport` deleted; `App.tsx` palette drag now uses world-coord helpers via the same view math as the seed-starting prototype.
- ~~`seedlingLayersWorld` does not wire `highlightStore` flash/hover opacity per seedling. Seed-starting selection rings use the legacy hardcoded blue dashed outline. When per-id flash opacity becomes available to layers (Phase 5 highlight refinement), seedling selection should consume it the same way garden structures will.~~ Resolved: `seedlingLayersWorld` now takes a per-id `getHighlight(id)` callback wired to `useHighlightStore.computeOpacity` and modulates each seedling's `globalAlpha` independently during pulse.
- `trayLayersWorld` drops the legacy `showDragSpreadAffordances` / `dragSpreadAffordanceHover` rendering — per the gutter-affordance ADR, drag-spread markers move into a tool-owned overlay (Phase 4d `useSeedlingMoveTool`). The legacy markers are not ported into any layer; the tool will draw them.
- ~~`useSowCellTool` only claims when `useUiStore.seedDragCultivarId` is set. Today that flag is set during palette drags; click-to-sow on its own (without a current cultivar concept) will need either a new `currentCultivarId` UI field or a different gating signal. Phase 5 left this as-is to honor the "do not modify store semantics beyond strictly required" constraint.~~ Resolved: added `useUiStore.armedCultivarId` plus `setArmedCultivarId`, wired palette planting click → toggle arm, sow tool consumes it as fallback gate, Escape / right-click disarm. See behavior.md "Click-to-sow arming".
- `SeedStartingCanvasNewPrototype` does not register `useEricSelectTool` (area-select on tray background). Phase 5 attempt: the existing tool is typed against `GardenSceneAdapter` and would conflict with `useSeedlingMoveTool` over click semantics; instead, Phase 5 wired empty-click → `clearSelection` directly into `useSeedlingMoveTool.pointer.onClick`. True marquee area-select for tray bg remains future work — likely a dedicated seed-starting select tool or a generalized tray-aware variant of `useEricSelectTool`.
- ~~`SeedStartingCanvasNewPrototype` view bridge still mirrors `useUiStore.seedStartingZoom`/`seedStartingPanX/Y`.~~ Resolved 2026-05-04: view state moved into the canvas's local React state. Palette → tray drags hand a `palettePointerPayload` to the canvas via `useUiStore`; `usePaletteDropTool` (in `src/canvas/tools/`) reads the canvas's own `viewRef` to compute world coords for fill preview and commit. `useUiStore.seedStartingZoom`/`seedStartingPanX/Y` and their setters are deleted. Reset action signals via `seedStartingViewResetTick` counter.
- Gutter overlay reads scratch via a `useRef` mirror because the `RenderLayer` is created once per tool. If weasel ever supports per-render scratch access in `Tool.overlay.draw`, simplify by removing the ref.

## Canvas redesign deferrals (Phase 5)

- ~~`RenderLayersPanel` now hardcodes the layer descriptor list (id/label/alwaysOn/defaultVisible) for the four garden groups.~~ Resolved: each `*LayersWorld.ts` exports a `*_LAYER_DESCRIPTORS` array as the single source of truth; factories build their `RenderLayer` objects from those descriptors, `RenderLayersPanel` imports the arrays for explicit group membership, and `layerDescriptors.test.ts` asserts factory output matches the descriptor array exactly.
- ~~Per-id flash opacity for seedling selection still unwired; garden currently aggregates all selected ids into a single `highlightOpacity`. Push per-id pulses into both modes.~~ Resolved: seedlings pull per-id opacity via `useHighlightStore.computeOpacity` through `createSeedlingLayers`; garden mode now uses per-id flash via `EricSceneUi.getOpacity(id)`. Remaining cleanup: the two modes use slightly different callback shapes (`getOpacity` vs `getHighlight`); consolidate when there's appetite.
- ~~Click-to-sow without a current cultivar concept (see Phase 4 deferral on `useSowCellTool`) — design a `currentCultivarId` UI source.~~ Resolved via `armedCultivarId` (see Phase 4 deferral above).
- True marquee area-select on seed-starting tray background (see updated Phase 4 deferral).
- ~~Palette drag → Tool primitive (`usePaletteDropTool`) so the seed-starting view bridge can drop and the canvas owns its own view state.~~ Resolved 2026-05-04 — see Seed-starting deferrals above.
- ~~Garden palette → canvas drag (`App.handlePaletteDragBegin`) still reads `useUiStore.zoom`/`panX`/`panY` directly…~~ Partially resolved 2026-05-04: the palette-drag refactor landed via `useGardenPaletteDropTool` (registered on `GardenCanvasNewPrototype`). `App.handlePaletteDragBegin` is now a 3-line setter that hands the gesture off through `palettePointerPayload`, mirroring `handleSeedDragBegin`. The new tool still reads `useUiStore.zoom`/`panX`/`panY` directly (minimal-scope refactor) — full canvas-owned view migration for garden mode (`viewRef`, local React view state, plumbed setter, mirroring every layer that reads zoom/pan) is **still deferred**. Pursuing it requires touching every garden layer/tool that consults the view.

## ViewToolbar wire-up deferrals

- ~~`viewMode === 'zoom'` is not wired to a canvas tool.~~ Resolved: `useEricClickZoomTool` claims plain left-click in zoom mode (shift inverts), wired into both `CanvasNewPrototype` and `SeedStartingCanvasNewPrototype`. Cursor flips `zoom-in`/`zoom-out` based on shift state. Double-click-on-button still resets to fit-view via `ViewToolbar`.
- ~~`viewMode === 'select-area'` aliases to the regular select tool…~~ Resolved: `useEricSelectTool` now takes a `forceMarquee` flag; `CanvasNewPrototype.tsx` registers a second variant with id `eric-select-area` and routes it when `viewMode === 'select-area'`. Drag-from-body draws a marquee; click-on-empty still clears selection.
- `viewMode === 'draw'` aliases to select unless a plotting tool is picked from the palette, at which point `useInsertTool` activates. A freehand / polygon draw tool that emits a new zone or annotation is still TODO.

## Editing

- ~~Edge-collision / containment for structure & zone drags: nothing currently prevents a structure from being dragged off the garden bounds or overlapping another structure. Grid-snap was added but no clamping. Pick a policy (clamp to bounds vs. allow-and-show-warning) and add a behavior to `useEricSelectTool`'s move pipeline.~~ Resolved 2026-05-04: hard-clamp to garden bounds for structures & zones; transient red clash highlight for structure-on-structure overlap (non-blocking); zones may overlap freely. See `src/canvas/tools/structureMoveBehaviors.ts`.
- Multi-select group-drag clamp/clash edge cases: weasel's `useMove` invokes `MoveBehavior.onMove` only on the primary id; secondaries share the primary's delta. Today the clamp computes the union AABB and shifts the primary, which transitively shifts secondaries (correct). The clash detector likewise uses the secondaries' AABBs (each derived from origin + primary delta). Two follow-ups: (1) confirm behavior once the parallel group-outline drag work expands the drag set; (2) consider exposing a `behavior.onMoveAll` hook in weasel so behaviors can address every dragged id directly rather than relying on shared-delta inheritance.

## Phase 5 audit punch list — remaining

Surfaced during the post-migration audit (commits `0ec1cdc`…`02140b0` closed the rest). Roughly ordered by user-visible impact.

- ~~**Group outlines.**~~ Resolved: design pass landed (see canvas-redesign group-outline-behavior proposal). Drag-the-group and marquee-expand-to-group are wired in `useEricSelectTool` via `src/utils/groups.ts#expandToGroups`. Click-the-outline-to-promote was deferred to a future iteration; group-bounds outline rendering still uses a single style. Remaining group deferrals:
  - Delete and clone (alt-drag) currently operate on the narrow `useUiStore.selectedIds`, not the expanded group set. Decide whether destructive ops should auto-expand to group siblings, or require explicit "select all in group" affordance first.
  - Click-the-outline-to-promote-selection (option B in the proposal): currently the group outline is decorative; clicking it does nothing. Revisit if users find it confusing.
  - Visual feedback for "implicit drag set" — v1 keeps one outline style for all selected members; consider a distinct style for "group siblings dragged along with primary selection".
- ~~**Selection-rides-on-history.**~~ Resolved: `pushHistory` snapshots `useUiStore.selectedIds` into each checkpoint (`src/store/history.ts`), `gardenStore.undo`/`redo` restore via `setSelection`, and `scrubSelection` filters out ids that no longer exist in the restored garden so selection never references deleted objects. Covered end-to-end by the paste-then-undo case in `src/store/gardenStore.test.ts` ("paste-then-undo via insert adapter does not leave stale ids selected").
- ~~**Click-to-zoom tool for `viewMode === 'zoom'`.**~~ Done: see `useEricClickZoomTool` (`src/canvas/tools/useEricClickZoomTool.ts`).
- **Freehand/polygon draw tool for `viewMode === 'draw'` without a plotting tool selected.** Currently aliases to select. Design a draw tool that emits a free-form zone or annotation.
- ~~**`?debug=handles` overlay.**~~ Resolved: `createAllHandlesLayer` registered behind the `?debug=handles` token; renders muted half-opacity handles on every selectable entity. See `selectionLayersWorld.ts`.

## Almanac

- **PHZM disclaimer for any rendered map.** Per the OSU/USDA terms-of-use bundled with the PHZM 2023 raster, derived maps must either keep both USDA-ARS and OSU logos or carry a "not the official USDA Plant Hardiness Zone Map" disclaimer with logos removed. Today we only consume the data as point lookups (no map rendering), so no disclaimer surface exists. If we ever render a heatmap, choropleth, or zone-by-region overlay derived from this grid, add the disclaimer/logo surface at that point.

## Seed-starting multi-tray auto-flow deferrals (v1, 2026-05-04)

- **Drag-to-reorder trays.** v1 lays trays out in insertion order with no UI to reorder them. Need a drag affordance on the FloatingTraySwitcher entries (or in-canvas drag of the tray body) that mutates `seedStarting.trays[]` order; `trayWorldOrigin` then reflows automatically. Design question: does reorder snap-back if the new origin clips an in-flight palette drag?
- **Vertical wrapping.** All trays sit on a single row in v1. For wide collections we'll want to wrap onto multiple rows (or columns) once the union width exceeds some viewport-relative threshold. `trayWorldOrigin` and `seedStartingWorldBounds` are the only two functions that need to learn the wrapped layout.
- **Free placement of trays.** v1 has no per-tray `(x, y)` — once the user wants benches/shelves or non-rectangular arrangements, add an explicit pose to each `Tray` and let `trayWorldOrigin` prefer that pose when set, falling back to auto-flow when null. File-format change.
- **Bench / shelf parents.** Trays should be groupable into a "bench" or "shelf" parent that owns its own world pose, with trays positioned relative to it. Likely paired with free placement above. Touches the seed-starting model schema, `seedStartingScene` adapter, and persistence.

## Raised-bed feature

- [ ] Expand companion/antagonist table beyond the v1 seed (~30 pairs in `src/data/companions.ts`). Source: extension-service publications, vetted gardening references.
- [ ] Build a real `bands` editor for `banded-rows` arrangements (currently JSON-only).
- [ ] Build a region-painting UI for `multi` arrangements (currently optimizer-only entrypoint).
- [ ] Auto-migration of existing `rows`-arrangement raised beds to `multi` when companion blocks are detected.

## Bed-layout optimizer deferrals (Plan 2, 2026-05-04)

- ~~**Optimizer model has constraint explosion → solver times out without incumbent.**~~ Resolved 2026-05-05: rewrote adjacency formulation in `buildMipModel`. Old form emitted one constraint per (plant-pair × cell-pair within 24in) — ~372k constraints for an 8-plant 4×8 bed. New form emits one constraint per (plant-pair × candidate-cell-of-a) with the b-side aggregated as `Σ x[b, c_b ∈ N(c_a)]`. Equivalent because each plant is placed in exactly one cell. Drops to ~5k constraints; same case now solves to incumbent in <5s. Worker also drops candidates with zero placements so "Time limit + no incumbent" no longer surfaces as a misleading "3 candidates found." See `src/optimizer/formulation.ts:160-220` and `src/optimizer/worker.ts`.
- ~~**Symmetry-breaking constraint can over-constrain.**~~ Resolved 2026-05-05: weakened from `Σ order·x[a] − Σ order·x[b] ≤ −1` to `≤ 0`. Coverage already forbids two copies of the same cultivar at the same cell (overlapping footprints), so allowing equality admits no illegal solution. The strict form combined with the big-M cellOrder coefficient (1000) gave a weak LP relaxation and slow branch-and-bound. See `src/optimizer/formulation.ts:110-130`.
- [ ] **Replace HiGHS-WASM same-species adjacency fallback with a proper fix.** 2026-05-05: highs-js 1.8.0 crashes mid-solve for ≥8 same-cultivar copies in a 4×7.5ft bed (5650 adj rows, 5MB LP). Crash mode varies — table-OOB / "Too few lines" / Aborted() — because module heap state from a failed solve leaks into the next call. Workaround in `worker.ts` retries without same-species adj rows on solver failure (loses spreading penalty). Real fix options: (a) upgrade highs-js when available, (b) fresh module instance per solve to isolate heap state, (c) reformulate same-species spacing as a per-cell-pair penalty that scales better, (d) switch solver. See `src/optimizer/worker.ts` (`trySolve`/`sameSpeciesAuxNames`) and the topology-only regression in `src/optimizer/eightTomatoRegression.test.ts`.
- [ ] **Aux-var NaN coefficient defensive guard.** When test harnesses pass weights with the wrong field names, `weights.sameSpeciesBuffer === undefined` flows into `auxCoeff -= undefined` → NaN, which serializes to `obj: − NaN n_0_1`. Production path uses `DEFAULT_WEIGHTS` so this can't happen at runtime, but `buildMipModel` should validate weights or assert finite coefficients before serialization. Low priority — `auxCoeff === 0` is now skipped (no aux row emitted), and a finite-check is in place at the same site.
- [ ] **Populate cultivar metadata for optimizer fields.** The MILP needs per-cultivar sun requirements, companion/antagonist relationships, and other agronomic data; current `cultivars.ts` only has display + footprint info. Without this, the optimizer's pairwise terms (shading/companions/antagonists) reduce to noise. Plan: extend `Cultivar` with `sun: 'full'|'partial'|'shade'`, `season`, etc.; backfill the existing entries; expand `companions.ts` from the v1 ~30-pair seed to a sourced table.
- [ ] Extract `src/optimizer/` into a standalone npm package once the API has settled.
- [ ] Symmetry/aesthetic objective term for the optimizer (deferred — hard to linearize).
- [ ] Live re-optimization during drag (deferred — UX complexity).
- [ ] Multi-season / crop rotation optimization.
- [ ] Optimizer support for non-rectangular beds.
- [ ] User-facing solver picker (currently fixed to `highs`).
- [ ] Region-painting UI for `userRegions` input to the optimizer.

## Optimizer auto-clustering follow-ups (2026-05-05)

- [ ] Visualize cluster regions on the canvas (overlay shading per group), gated on user opt-in to define regions
- [ ] Post-hoc cluster rotation/swap pass to reclaim cross-cluster companion bonuses lost at partition boundaries
- [ ] Greedy fallback that respects existing intentional placements rather than producing a generic hex-packed layout
- [ ] Interior trellis support (`trellis: { kind: 'line', ... }`): UI for placement, allocator for dual-side strip layout. Currently rejected with an error in `proportionalStripAllocator`.
- [ ] Adaptive partitioner selection based on input shape (homogeneous bypass, paired-mirror, diversity-spread)
- [ ] Adaptive allocator selection (guillotine cuts, bin-packing) — currently only proportional strips
- [ ] Parallel sub-bed solves via multiple workers — currently sequential within a single worker
- [ ] Cross-cluster score reported as a candidate-comparison stat (no objective contribution, just informational)
- [ ] Minimum strip width enforcement in `proportionalStripAllocator` (currently allows arbitrarily thin strips; fewer plants get placed but no error fires)
- [ ] Cultivar-level `heightFt` overrides in `cultivars.json` for varieties that genuinely differ from species default (e.g. determinate vs. indeterminate tomatoes). Species data was backfilled 2026-05-05 so the shading objective term now fires across mixed-species beds, but same-species/different-cultivar beds still see `hasShading=false` because every cultivar inherits one species-level height. Until cultivar overrides exist, an all-tomato bed gets no shading signal.
- [ ] Optimize `clusterCohesion` aux-row generation. The term added 2026-05-05 emits C(n,2) aux vars + adjacency rows per cluster — perf test budget bumped from 2s → 6s for a 30-plant scenario. Options: share precomputed adjacency between cohesion-only pairs (currently rebuilt per pair), or cap cohesion edges to k-nearest cluster members rather than all pairs. See `src/optimizer/formulation.ts` and the comment at `src/optimizer/perf.test.ts:33-37`.
