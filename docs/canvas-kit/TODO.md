# canvas-kit / weasel TODO

Backlog for the canvas-kit framework (published as `@orochi235/weasel`). The
kit aims to be a generic 2D scene-graph foundation. Items here are evaluated
for cross-app reuse, not consumer-app value.

For history of completed work that pre-dates extraction, see `git log` and
the dated specs/plans under `specs/` and `plans/`.

## Tier 1 — foundational genericity gaps

Without these, the kit is essentially "axis-aligned-rectangle kit."

- **Paths and compound shapes.** `TPose` is generic at the type level but resize/insert/area-select/selection-overlay all bake in `{x, y, width, height}` math. Generalize to arbitrary paths: polygons, polylines, holes, boolean composition. Move + hit-testing + selection overlay all need a path-aware contract. Foundational for any non-rect editor (diagrams, schematics, illustration, mapping).
- **Groupable objects.** First-class group node: select-as-one, move-as-one, transform children relative to group origin. Adapter has `getParent`/`setParent` already; the gap is gesture semantics. Touches selection, area-select, clone, history. Universal across diagramming and illustration tools. *Partial: virtual groups via `members[]` shipped with resize-as-group; structural groups still pending.*
- **Text rendering.** `renderLabel` + `markdownText` cover static labels; the gap is editable text as a first-class scene object. Layout (single-line, wrapping, alignment), font handling, glyph hit-testing, in-place edit gesture (likely a new `useTextEditInteraction`). Separates "viewer" from "editor."

## Tier 2 — broad reuse

- **Customizable units.** *Done v1* (`UnitRegistry` / `UnitValue`, bare-number = base unit fallback) — see `src/units.ts`. Open follow-ups:
  - **Per-subobject scale.** Today the registry is global per consumer. Real apps want a child object (a sub-assembly in a CAD scene) to declare its own unit/scale, with conversion at the parent boundary. Likely lives on the parent/group node once Tier 1 #2 lands.
  - **Mixed-unit arithmetic** (`50% + 2ft`) — needs a context to resolve percentages against. Separate design problem.
  - **Per-axis units** — defer until a concrete use case appears (rare; e.g. timeline charts where x is time, y is value).
- **Grid overlay.** Promote `renderGrid` to a first-class `RenderLayer` factory with snap-aware visual hints (subdivisions, accent lines, snap-target highlight on hover). Consumes the same `gridSnapStrategy` so visual + behavioral grid agree. Small effort, universal benefit.

## Tier 1.5 — small additive hooks

- **Selection-driven action hooks** still pending (others done):
  - Clipboard key wrappers (Ctrl+C/X/V) — `useClipboard` is logic-only today; an action-level wrapper that binds keys mirrors `useDeleteAction`.
  - `useGroupAction` / `useUngroupAction` (Ctrl+G / Ctrl+Shift+G) — wraps `createGroupOp` / `dissolveGroupOp`; ships alongside structural groups.
  - `useUndoRedoAction` (Ctrl+Z / Ctrl+Shift+Z) — depends on history-stack design; defer until that lands.
- **`renderChildrenLayer` factory.** Consumes `OrderedAdapter` and renders children in z-order. Today consumers iterate `getChildren()` manually. Spawned by the sibling z-order work.
- **`wheelHandler.ts` cleanup.** Uses a percentage-based zoom convention (`MIN_ZOOM=10, MAX_ZOOM=200`) incompatible with the multiplier convention used by `ViewTransform.zoom` and `useZoomInteraction`. Normalize or deprecate.
- **Parallax plugin.** Multi-layer canvas where layers translate at different rates relative to the viewport pan. Useful for sketch/concept-canvas backgrounds, depth illusions, mapping, and game-style scenes. Likely a `RenderLayer` factory or thin wrapper over `usePanInteraction` exposing `parallaxFactor` per layer. Plugin form keeps it out of the core. Open question: does it warp `screenToWorld` for hit-testing, or is parallax purely cosmetic?

## Tier 3 — specialized but valuable

- **Bezier curves / splines (control-point editing gesture).** A path-capable kit (Tier 1 #1) gives the data shape; what's genuinely new here is the interaction pattern: editing handles on a curve. Specialized resize-like hook with non-corner anchors, plus curve sampling and hit-testing in the renderer. Useful for routing edges in node graphs, illustration, motion paths.
- **d3 integration plugin.** Bridge the adapter/op model to d3 selections so consumers can drive scene updates from data joins (enter → InsertOp, update → setPose, exit → DeleteOp). Strict plugin form — d3 stays out of the core. Real audience: dashboards, network graphs, force-directed layouts, scientific viz.

## Pre-extraction polish

(Tracked here so `subtree split` carries them. Re-evaluate before 0.1.0.)

- TODO/FIXME scan inside `src/`.
- JSDoc audit on the barrel (`src/index.ts`).
- README pitch draft for the public-facing repo.
