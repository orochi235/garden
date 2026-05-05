# Project TODO

Backlog of work that's been considered but not scheduled. Add new items at the bottom of the relevant section.

## Refactors

### Repeatable putative-drag framework

Right now the only drag operation that shows a putative ghost preview is seed-mode shift-fill. That preview is hardcoded:
- Transient `seedFillPreview` on `uiStore` is shape-specific to "{trayId, cultivarId}"
- `renderSeedlings` has a special branch that draws ghost seedlings in empty cells
- `App.handleSeedDragBegin` does its own shift / pointer-move tracking

All other drag operations (palette → garden, structure / zone resize, move, plot, area-select, sow-single-cell) commit on pointerup with no ghost preview, and each lives in its own ad-hoc hook under `src/canvas/hooks/`.

Goal: every drag is computed putatively on each pointer / key change, and renders a ghost of its would-be result while in flight.

Sketch:

1. Define a `Drag<TInput, TPutative>` interface:
   - `read(pointerEvent, modifiers, viewport): TInput`
   - `compute(input): TPutative`  (pure)
   - `renderPreview(ctx, putative, viewport)`
   - `commit(putative)`
2. One transient `dragPreview: { kind, putative } | null` slot on `uiStore`. Replaces ad-hoc `seedFillPreview`, `dragOverlay`, etc.
3. Central drag controller dispatches pointer / key events to the active `Drag` and writes `compute()` result into the slot.
4. Render layers consult the slot and call the matching `renderPreview` for the active kind.
5. Migrate existing drags one at a time. Order of attack:
   - sow-cell + fill-tray (already half-implemented)
   - palette → garden plant-drop
   - move (single + multi)
   - resize
   - plot (rectangle drag)
   - area-select (already shows a marquee, but it's separate)

Watch out for:
- Modifier keys (shift, alt, cmd) need to update the preview without further pointer movement — the existing seed handler already has `keydown`/`keyup` listeners; that pattern generalizes.
- Some drags (move, resize) already mutate the store mid-flight via `commitPatch`-style undo wrapping. Putative compute should NOT mutate; only `commit` should.
- Render performance: most layers redraw on store changes; preview updates fire many times per second. The seedling layer's invalidation already handles this fine, but scaled up to all drags it may need throttling or a dedicated preview canvas.

## canvas-kit / weasel

Backlog for the kit lives at [`docs/canvas-kit/TODO.md`](canvas-kit/TODO.md) so it travels with the kit when it splits out into the `@orochi235/weasel` repo. Add kit-specific items there, not here.

## Canvas redesign deferrals (Phase 1)

- `gardenSceneAdapter.findSnapTarget` is a no-op for structure and zone nodes. Once Phase 2 wires drag-to-move on structures/zones, decide whether to add a grid-snap branch or accept free positioning.
- `gardenSceneAdapter.setParent` for plantings recomputes local from current world pose to preserve visual position, but `gardenStore.updatePlanting` runs `rearrangePlantings` whenever `parentId` changes, which overwrites those local coords. Decide whether kit-driven drag-and-drop reparenting should bypass arrangement, defer to it, or get a new "manual position" path.

## Canvas redesign deferrals (Phase 2)

- Seedling and tray layers were not converted in Phase 2. They still live as legacy `SeedlingLayerRenderer`/`TrayLayerRenderer` and are not registered in `CanvasNewPrototype`. Phase 4 should port them to world-coord `RenderLayer`s alongside the gutter-affordance refactor.
- System layer (origin marker, axes, grid debug) not converted. Decide in Phase 3 whether the new prototype needs a counterpart or if it stays legacy-only.
- `hitTest.ts` and `seedStartingHitTest.ts` were left alone in Phase 2 because their math was already mostly world-coord; the spec called for an explicit conversion + tests to confirm. Do that pass when wiring gestures in Phase 3.
- Highlight pulse and flash are still imperative in `uiStore`/per-layer state. Move to a single Zustand-backed `highlightOpacity` value driven by a shared rAF tick when porting selection gestures (Phase 3).
- `CanvasNewPrototype` hardcodes `highlightOpacity: 0` and `showFootprintCircles: true`. Wire to real ui state once Phase 3 introduces toggles.
- Selection rendering reads from `uiStore.selectedIds` but selection editing/gestures aren't wired (`selectionMode="none"`). Phase 3 connects palette/drag/click → adapter.
- Label de-occlusion in `planting-labels` uses world-coord rects; the legacy version used screen rects. Visually verify behavior matches once labels are turned on at varied zoom levels (Phase 3).
- `vite.config.ts` gained `resolve.dedupe: ['react', 'react-dom']` to fix duplicate-React errors when consuming linked weasel. Once weasel ships as a published package this dedupe is still safe but no longer load-bearing; revisit if it causes issues.

## Canvas redesign deferrals (Phase 3)

- Highlight pulse is aggregated as `max(computeOpacity(id))` over the selected set and threaded into layers as a single `highlightOpacity` number. Per-id pulsing (so two flashing entities can ramp independently) is a Phase 5 refinement.
- Alt+drag clone behavior was dropped from `useEricCycleTool` — alt currently only cycles topmost-stack on click. If we want alt-drag-to-duplicate parity with the legacy canvas, wire kit's `useClone`/`useDuplicate` behind a dedicated tool in Phase 4/5.
- `CanvasNewPrototype` still hardcodes `showFootprintCircles: true` because no `useUiStore` flag exists for it. Add a toggle in the Plantings sidebar section if/when needed.
- Insert tool (kit's `useInsertTool` + `InsertAdapter`) is not wired. Palette drags from the sidebar still flow through the legacy `useDragLayout` path. Phase 4 will plumb insert through the new tools registry.
- Paste/clipboard (kit's `useClipboard`) is not wired into the new prototype. Defer until Phase 4 alongside insert.
- Snap behaviors (`snapToGrid`, `snapToContainer`, `snapBackOrDelete`) are not yet attached to `useMove` options. Phase 5 will compose them once the snap-back UX is ported.
- `seedStartingHitTest.ts` is still screen-space and untouched — only used by the seed-starting view, which is Phase 4 work.
- `structureLayersWorld.ts` clamps `rimWidth`/`wallWidth` to half the structure dimension and skips pattern overlays when inner extent ≤ 4 world units. Tiny structures will render without the inner pattern overlay; revisit if that's visually objectionable when zoomed way in.
- `useEricSelectTool.pointer.onClick` clears selection on a no-drag click in empty space (drag.onEnd never fires when the user doesn't move the pointer). Verify this matches legacy click-to-clear semantics across modifier combinations.
- Wheel zoom from kit's `useWheelZoomTool` was wired but not visually verified — the Playwright dispatched-WheelEvent didn't change zoom in our smoke test. May require a modifier (ctrl/meta) by kit default; check kit options if real-mouse scroll doesn't zoom.
- Label de-occlusion visual check at varied zoom levels was not exhaustively performed; the prototype renders labels but a side-by-side comparison against the legacy canvas at low/medium/high zoom is still TODO.
- The pre-existing nested `<button>` hydration warning in `LayerSection` > `ToggleSwitch` is unrelated to the canvas redesign but surfaces in the new prototype's console. Track separately.

## Canvas redesign deferrals (Phase 4)

- `seedStartingScene` adapter places every tray's world origin at `(0, 0)`. The data model has no per-tray world position and the legacy view is single-tray (centered via viewport `originX/originY`). When multi-tray support lands, give each tray its own `(x, y)` field and update `trayWorldOrigin` to read it; today, `findSnapTarget` will pick the geometrically-closest tray but they all share the same origin so multi-tray semantics are not meaningful yet.
- `seedStartingScene.setParent` is a no-op. Cross-tray drag-to-reparent is not part of the seed-starting flow today; if we ever want it, route through `removeSeedling`/`addSeedling` or a new store action that preserves cell identity.
- `seedStartingScene.setPose` requires the dragged seedling to already live in a tray (uses `store.moveSeedling` which only swaps within one tray). Inserting a brand-new seedling via the move pipeline isn't supported — that's an `InsertAdapter` concern for the future seed-starting insert tool.
- Gutter handling (drag-spread affordances along tray edges) deliberately omitted from `SeedNode`. A parallel sub-task owns the design decision; once resolved, add a `GutterNode` kind and re-introduce `hitTestDragSpreadAffordance` integration.
- ~~`seedStartingHitTest.ts` still exposes the original screen-space `hitTestCell` used by `CanvasStack.tsx` and `App.tsx`.~~ Resolved in Phase 5: screen-space helpers and `getTrayViewport` deleted; `App.tsx` palette drag now uses world-coord helpers via the same view math as the seed-starting prototype.
- `seedlingLayersWorld` does not wire `highlightStore` flash/hover opacity per seedling. Seed-starting selection rings use the legacy hardcoded blue dashed outline. When per-id flash opacity becomes available to layers (Phase 5 highlight refinement), seedling selection should consume it the same way garden structures will.
- `trayLayersWorld` drops the legacy `showDragSpreadAffordances` / `dragSpreadAffordanceHover` rendering — per the gutter-affordance ADR, drag-spread markers move into a tool-owned overlay (Phase 4d `useSeedlingMoveTool`). The legacy markers are not ported into any layer; the tool will draw them.
- `useSowCellTool` only claims when `useUiStore.seedDragCultivarId` is set. Today that flag is set during palette drags; click-to-sow on its own (without a current cultivar concept) will need either a new `currentCultivarId` UI field or a different gating signal. Phase 5 left this as-is to honor the "do not modify store semantics beyond strictly required" constraint.
- `SeedStartingCanvasNewPrototype` does not register `useEricSelectTool` (area-select on tray background). Phase 5 attempt: the existing tool is typed against `GardenSceneAdapter` and would conflict with `useSeedlingMoveTool` over click semantics; instead, Phase 5 wired empty-click → `clearSelection` directly into `useSeedlingMoveTool.pointer.onClick`. True marquee area-select for tray bg remains future work — likely a dedicated seed-starting select tool or a generalized tray-aware variant of `useEricSelectTool`.
- `SeedStartingCanvasNewPrototype` view bridge still mirrors `useUiStore.seedStartingZoom`/`seedStartingPanX/Y`. Phase 5 kept the bridge: `App.tsx`'s palette drag handler reads it to compute world coordinates without screen-space helpers. To drop the bridge entirely, port palette-drag-to-sow into a Tool primitive (e.g. `usePaletteDropTool`) so the canvas's local view state is the only source of truth.
- Gutter overlay reads scratch via a `useRef` mirror because the `RenderLayer` is created once per tool. If weasel ever supports per-render scratch access in `Tool.overlay.draw`, simplify by removing the ref.

## Canvas redesign deferrals (Phase 5)

- `RenderLayersPanel` now hardcodes the layer descriptor list (id/label/alwaysOn/defaultVisible) for the four garden groups. Keep this in sync with `src/canvas/layers/{structure,zone,planting,selection}LayersWorld.ts` whenever a layer is added or its flags change. Future cleanup: have each `createXxxLayers` factory expose a `*_LAYER_DESCRIPTORS` static so the panel doesn't drift.
- Per-id flash opacity for seedling selection still unwired; garden currently aggregates all selected ids into a single `highlightOpacity`. Push per-id pulses into both modes.
- Click-to-sow without a current cultivar concept (see Phase 4 deferral on `useSowCellTool`) — design a `currentCultivarId` UI source.
- True marquee area-select on seed-starting tray background (see updated Phase 4 deferral).
- Palette drag → Tool primitive (`usePaletteDropTool`) so the seed-starting view bridge can drop and the canvas owns its own view state.

## ViewToolbar wire-up deferrals

- `viewMode === 'zoom'` is not wired to a canvas tool. Toolbar button is visually selectable but produces only a one-time console warning. Design a click-to-zoom-in / shift-click-to-zoom-out tool (cursor: zoom-in / zoom-out) and register it under id `'zoom'` in `CanvasNewPrototype.tsx`. Double-click-on-button already triggers `computeFitView` reset via `ViewToolbar.handleZoomReset`.
- `viewMode === 'select-area'` aliases to the regular select tool (no warning); `useEricSelectTool` already supports drag-marquee in empty space. If "select area" is meant to be a distinct mode (e.g. forces marquee even when starting on an object), add a separate tool or a flag on the select tool.
- `viewMode === 'draw'` aliases to select unless a plotting tool is picked from the palette, at which point `useInsertTool` activates. A freehand / polygon draw tool that emits a new zone or annotation is still TODO.

## Editing

- Edge-collision / containment for structure & zone drags: nothing currently prevents a structure from being dragged off the garden bounds or overlapping another structure. Grid-snap was added but no clamping. Pick a policy (clamp to bounds vs. allow-and-show-warning) and add a behavior to `useEricSelectTool`'s move pipeline.

## Phase 5 audit punch list — remaining

Surfaced during the post-migration audit (commits `0ec1cdc`…`02140b0` closed the rest). Roughly ordered by user-visible impact.

- **Group outlines.** Selecting one member of a structure group should draw a group-bounds outline so the user can see the implicit selection extent. Needs a design pass: outline as separate render layer? handle hit-testing? does dragging one member move the group?
- **Wheel-zoom hands-on smoke test.** Tool is wired on both `CanvasNewPrototype` and `SeedStartingCanvasNewPrototype` and unit-tested for cursor-anchored zoom + clamping. Still want a real-mouse + trackpad-pinch pass to confirm UX feels right (no jumping, anchor matches cursor, pinch doesn't fight browser zoom).
- **Per-id selection-flash opacity.** `CanvasNewPrototype` aggregates all selected ids into a single `highlightOpacity` via max(); the layer protocol takes one number rather than a per-id getter. Migrate `EricSceneUi.highlightOpacity` to a `getOpacity(id)` callback and update each `*LayersWorld.ts` highlight branch. Touches every layer file plus their tests.
- **Selection-rides-on-history.** Undo/redo currently leaves `useUiStore.selectedIds` untouched, so undoing a paste leaves the (now-deleted) ids selected. Need to either snapshot selection into history checkpoints or scrub stale ids on every history transition.
- **Click-to-zoom tool for `viewMode === 'zoom'`.** Toolbar button currently warns once on activation; wire a tool with cursor `zoom-in`/`zoom-out` (shift inverts) that increments/decrements `useUiStore.zoom` around the click point. Double-click-on-button already resets to fit-view.
- **Freehand/polygon draw tool for `viewMode === 'draw'` without a plotting tool selected.** Currently aliases to select. Design a draw tool that emits a free-form zone or annotation.
