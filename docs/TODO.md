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

- **Customizable units.** *Done v1* (`UnitRegistry` / `UnitValue`, bare-number = base unit fallback) — see `src/canvas-kit/units.ts`. Open follow-ups:
  - **Per-subobject scale.** Today the registry is global per consumer. Real apps want a child object (a tray inside a garden, a sub-assembly in a CAD scene) to declare its own unit/scale, with conversion at the parent boundary. Likely lives on the parent/group node once Tier 1 #2 lands, since "scope of unit" and "scope of grouping" overlap.
  - **Mixed-unit arithmetic** (`50% + 2ft`) — needs a context to resolve percentages against. Separate design problem.
  - **Per-axis units** — defer until a concrete use case appears (rare; e.g. timeline charts where x is time, y is value).
- **Grid overlay.** Promote `renderGrid` to a first-class `RenderLayer` factory with snap-aware visual hints (subdivisions, accent lines, snap-target highlight on hover). Consumes the same `gridSnapStrategy` so visual + behavioral grid agree. Small effort, universal benefit.

### Tier 1.5 — small additive hooks (do after groups Phase 3-4)

- **`useZoomInteraction`.** *Spec + plan written; ready to implement.* See `docs/superpowers/specs/2026-05-01-canvas-kit-zoom-interaction-design.md` and `docs/superpowers/plans/2026-05-01-canvas-kit-zoom-interaction.md`. Follow-up flagged during planning: `wheelHandler.ts` uses a percentage-based zoom convention (`MIN_ZOOM=10, MAX_ZOOM=200`) incompatible with the multiplier convention used by `ViewTransform.zoom` and the new hook. The hook inlines its own focal-point math; the future cleanup is to normalize `wheelHandler.ts` onto the multiplier convention or deprecate it.
- **~~`useDeleteAction`~~** *Done* (`660800a`).
- **Selection-driven action hooks.** Same shape as `useDeleteAction` (read selection → emit ops → `applyBatch`, optional key binding). Strong fits, no new infrastructure needed:
  - `useNudgeAction` — arrow keys translate selection by 1 unit; shift = larger step. Reuses `translatePose`.
  - `useDuplicateAction` — Ctrl+D, clones selection at offset via the existing clone op pipeline.
  - `useSelectAllAction` — Ctrl+A, emits `setSelection(allIds)`. Adapter needs `listAll()`.
  - `useEscapeAction` — Esc clears selection. Trivial but symmetric.
  - Clipboard key wrappers (Ctrl+C/X/V) — `useClipboard` is logic-only today; an action-level wrapper that binds keys mirrors `useDeleteAction`.
  - `useGroupAction` / `useUngroupAction` (Ctrl+G / Ctrl+Shift+G) — wraps `createGroupOp` / `dissolveGroupOp`; ships alongside groups Phase 3+.
  - `useUndoRedoAction` (Ctrl+Z / Ctrl+Shift+Z) — depends on history-stack design; defer until that lands.
- **~~Sibling z-order.~~** *Done (2026-05-01)* (`10f8282`..`a4e785f`). Implicit array order via `OrderedAdapter` mixin (`getChildren(parentId)` returns ids in z-order); routes through `GroupAdapter.members[]` for virtual groups. Reorder ops (`bringForward`, `sendBackward`, `bringToFront`, `sendToBack`, `moveToIndex`) and `useReorderAction` hook (`]` / `[`, shift-bracket for to-front/back). Follow-up: a generic `renderChildrenLayer` factory that respects child order — today consumers iterate manually.
- **~~Test coverage gap pass.~~** *Done* (`210bc20`..`9b47693`). 13 new test files, +120 cases. Suite at 833 passing.
- **Parallax plugin.** Multi-layer canvas where layers translate at different rates relative to the viewport pan. Useful for sketch/concept-canvas backgrounds, depth illusions, mapping (terrain shading layers), and game-style scenes. Likely a `RenderLayer` factory or a thin wrapper over `usePanInteraction` that exposes a `parallaxFactor` per layer (0 = locked to viewport, 1 = moves with content, fractions = depth). Plugin form keeps it out of the core. Open question: does it warp `screenToWorld` for hit-testing on the parallaxed layer, or is parallax purely cosmetic?

### Tier 3 — specialized but valuable

- **Bezier curves / splines (control-point editing gesture).** A path-capable kit (Tier 1 #1) gives the data shape; what's genuinely new here is the interaction pattern: editing handles on a curve. Specialized resize-like hook with non-corner anchors, plus curve sampling and hit-testing in the renderer. Useful for routing edges in node graphs, illustration, motion paths.
- **d3 integration plugin.** Bridge the adapter/op model to d3 selections so consumers can drive scene updates from data joins (enter → InsertOp, update → setPose, exit → DeleteOp). Strict plugin form — d3 stays out of the core. Real audience: dashboards, network graphs, force-directed layouts, scientific viz.
