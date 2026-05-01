# canvas-kit

`canvas-kit` is a domain-agnostic toolkit for building 2D interactive canvas
surfaces. It bundles viewport math, pointer-driven gesture hooks, an op-based
edit/undo model, and a small set of layered renderers. The kit knows nothing
about the consumer's domain (gardens, diagrams, slides) — every gesture talks
to a per-app **adapter** that translates kit calls into domain mutations.

A new surface is built by (1) writing an adapter against the kit's narrow
interfaces, (2) calling one or more interaction hooks, (3) rendering an
overlay from the hook state alongside the static scene.

Source lives at `src/canvas-kit/`. The demo page (`/garden/canvas-kit-demo.html`,
served by Vite at root) hosts minimal end-to-end consumers under
`src/canvas-kit-demo/demos/`. The production consumer is `src/canvas/CanvasStack.tsx`.

## Where to read next

- [concepts.md](./concepts.md) — adapters, ops, gesture lifecycle, behaviors, overlays
- [hooks.md](./hooks.md) — reference for every public interaction hook
- [adapters.md](./adapters.md) — adapter interface reference + minimal example
- [extending.md](./extending.md) — writing a new behavior or interaction hook

## Public surface

### Interaction hooks

- `useMoveInteraction` — drag selected objects; ops produced via `createTransformOp`.
- `useResizeInteraction` — resize a single object from a corner/edge anchor.
- `useInsertInteraction` — drag-rectangle to create a new object via the adapter.
- `useAreaSelectInteraction` — marquee select; ops are typically transient.
- `useCloneInteraction` — alt-drag (or any modifier-gated) clone of selection.
- `useClipboard` — copy/paste against an `InsertAdapter`; cascades paste offset.
- `usePanInteraction` — drag-to-pan a viewport (kit-level pan, not gesture system).
- `useDragHandle` / `useDropZone` — DOM-level pointer drag with ghost element and
  drop-zone registry; used for cross-surface drags (e.g. tray to canvas).

### Op types (`src/canvas-kit/ops/`)

- `createTransformOp({ id, from, to })` — pose change.
- `createReparentOp({ id, from, to })` — parent change.
- `createInsertOp({ object })` — create object; inverse is delete.
- `createDeleteOp({ object })` — remove object; inverse is insert.
- `createSetSelectionOp({ from, to })` — selection change.

Each op is `{ apply, invert, label?, coalesceKey? }` (see `src/canvas-kit/ops/types.ts`).

### History (`src/canvas-kit/history/`)

`createHistory(adapter)` returns an `apply` / `applyBatch` / `undo` / `redo`
controller backed by op inversion. Adapters that already manage history
(snapshot-style) skip this and just call ops directly in `applyBatch`.

### View transform (`src/canvas-kit/grid.ts`)

`ViewTransform = { panX, panY, zoom }`. Helpers: `worldToScreen`,
`screenToWorld`, `roundToCell`. Pan/zoom controllers: `usePanInteraction`,
`fitZoom` / `fitToBounds`, `useAutoCenter`, `wheelHandler`.

### Layer composition (`src/canvas-kit/renderLayer.ts`, `LayerRenderer.ts`)

`RenderLayer<TData>` is a named draw function with `defaultVisible` and
`alwaysOn` flags. `runLayers(ctx, layers, data, visibility, order?)` iterates
visible layers in order and calls each `draw`.

### Renderers

- `renderGrid` — adaptive grid with subdivision fade.
- `renderLabel` — text labels with screen-space sizing.
- `markdownText` — wrapping markdown rendering with a pattern cache (`patterns`).
- `createDragGhost` — DOM ghost factory used by `useDragHandle`.
