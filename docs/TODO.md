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

## canvas-kit future capabilities

Backlog for the canvas-kit framework. Each is its own design exercise — listed here so they aren't forgotten.

- **Paths and compound shapes.** Today `TPose` is implicitly axis-aligned rect-shaped (`{x, y, width, height}`) for resize/insert. Generalize to arbitrary paths: polygons, polylines, holes, boolean composition. Move + hit-testing + selection overlay all need a path-aware contract.
- **Groupable objects.** First-class group node: select-as-one, move-as-one, transform children relative to group origin. Adapter needs a parent/children model and a way to express "this object is the group, those are its members." Touches selection, area-select, clone, history.
- **Text rendering.** Editable text labels as scene objects. Layout (single-line, wrapping, alignment), font handling, hit-testing on glyphs, in-place edit gesture. Probably its own interaction hook (`useTextEditInteraction`).
- **Bezier curves / splines.** Smooth path objects with control handles. New interaction for editing control points (a specialized resize-like hook with non-corner anchors). Renderer needs curve sampling and hit-testing.
- **d3 integration (likely as a plugin).** Bridge canvas-kit's adapter/op model to d3 selections so consumers can drive scene updates from data joins. Plugin form: a thin layer that maps d3 enter/update/exit to InsertOp/setPose/DeleteOp. Keep d3 out of the core.
- **Customizable units.** Today everything is in unitless world coordinates. Support a unit system (px / in / ft / %) per scene, with conversion at the rendering boundary. Pairs with the broader unit-arithmetic note in memory (mixed-unit values like `50% + 2ft`).
- **Grid overlay.** Pull `renderGrid`'s ad-hoc usage into a first-class layer factory with snap-aware visual hints (subdivisions, accent lines, snap target highlight on hover). Probably consumes the same `gridSnapStrategy` so visual + behavioral grid agree.
