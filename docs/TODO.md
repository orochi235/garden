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

Backlog for the canvas-kit framework. The kit aims to be a generic 2D
scene-graph foundation (used by drag-lab, garden, and future apps) — items
are evaluated for cross-app reuse, not just garden value.

### Tier 1 — foundational genericity gaps

Without these, the kit is essentially "axis-aligned-rectangle kit."

- **Paths and compound shapes.** `TPose` is generic at the type level but resize/insert/area-select/selection-overlay all bake in `{x, y, width, height}` math. Generalize to arbitrary paths: polygons, polylines, holes, boolean composition. Move + hit-testing + selection overlay all need a path-aware contract. Foundational for any non-rect editor (diagrams, schematics, illustration, mapping).
- **Groupable objects.** First-class group node: select-as-one, move-as-one, transform children relative to group origin. Adapter has `getParent`/`setParent` already; the gap is gesture semantics. Touches selection, area-select, clone, history. Universal across diagramming and illustration tools.
- **Text rendering.** `renderLabel` + `markdownText` cover static labels; the gap is editable text as a first-class scene object. Layout (single-line, wrapping, alignment), font handling, glyph hit-testing, in-place edit gesture (likely a new `useTextEditInteraction`). Separates "viewer" from "editor."

### Tier 2 — broad reuse

- **Customizable units.** Coordinates are unitless today. A kit-level unit system (px / in / ft / mm / %) that the renderer and snap strategies understand is more reusable than per-app reinvention. CAD, floor plans, garden, PCB design, mapping all need this. Pairs with the mixed-unit-arithmetic note in memory (`50% + 2ft`).
- **Grid overlay.** Promote `renderGrid` to a first-class `RenderLayer` factory with snap-aware visual hints (subdivisions, accent lines, snap-target highlight on hover). Consumes the same `gridSnapStrategy` so visual + behavioral grid agree. Small effort, universal benefit.

### Tier 3 — specialized but valuable

- **Bezier curves / splines (control-point editing gesture).** A path-capable kit (Tier 1 #1) gives the data shape; what's genuinely new here is the interaction pattern: editing handles on a curve. Specialized resize-like hook with non-corner anchors, plus curve sampling and hit-testing in the renderer. Useful for routing edges in node graphs, illustration, motion paths.
- **d3 integration plugin.** Bridge the adapter/op model to d3 selections so consumers can drive scene updates from data joins (enter → InsertOp, update → setPose, exit → DeleteOp). Strict plugin form — d3 stays out of the core. Real audience: dashboards, network graphs, force-directed layouts, scientific viz.
