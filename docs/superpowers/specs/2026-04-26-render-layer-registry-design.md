# Render Layer Registry Design

## Goal

Replace monolithic per-canvas render functions with ordered, toggleable, reorderable sub-layers that share a uniform interface. Keep the existing `<canvas>` element stacking (grid, blueprint, structures, zones, plantings, system). Make the rendering process within each canvas composable and inspectable.

## Architecture

### RenderLayer Interface

The core abstraction shared across all canvas renderers:

```typescript
interface RenderLayer<TData> {
  id: string;
  label: string;
  draw: (ctx: CanvasRenderingContext2D, data: TData) => void;
  defaultVisible?: boolean;  // defaults to true
  alwaysOn?: boolean;        // can't be toggled off
}
```

Each canvas renderer holds an ordered array of `RenderLayer` objects. Each frame:
1. Pre-compute the `TData` object once (all state the layers need).
2. Walk the array in order.
3. For each layer: check visibility, call `draw()`.

### Four Canvas Renderers

**StructureLayerRenderer** — 6 sub-layers:
1. `structure-bodies` — fill + stroke (always on)
2. `structure-walls` — inner wall borders for containers
3. `structure-surfaces` — hatch overlay on paths/patios
4. `structure-plantable-area` — green hatch on container interiors (default off)
5. `structure-highlights` — golden ring on hover/flash
6. `structure-labels` — text labels below structures

**ZoneLayerRenderer** — 4 sub-layers:
1. `zone-bodies` — fill + dashed stroke (always on)
2. `zone-patterns` — pattern overlay
3. `zone-highlights` — golden ring on hover/flash
4. `zone-labels` — text labels below zones

**PlantingLayerRenderer** — 7 sub-layers:
1. `container-overlays` — slot dots + grid lines from arrangement
2. `planting-spacing` — dashed spacing border circles
3. `planting-icons` — footprint circle + plant icon (always on)
4. `planting-measurements` — footprint/spacing dimension labels (default off)
5. `planting-highlights` — golden ring on hover/flash
6. `planting-labels` — species/variety text below plants
7. `container-walls` — inner wall re-draw on top of plants

**SystemLayerRenderer** — promoted from bare `renderSelection()` call:
1. `selection-boxes` — blue outlines + resize handles

The system renderer is the home for future cross-cutting overlays (drag guides, cursor ghost, alignment snaps).

Grid, blueprint remain simple single-purpose canvases with no sub-layers.

### LayerData Types

Each renderer pre-computes a typed data object once per frame, shared by all its sub-layers.

**EntityLayerData** — common base for structures, zones, and plantings:

```typescript
interface EntityLayerData {
  view: ViewTransform;
  canvasWidth: number;
  canvasHeight: number;
  labelMode: LabelMode;
  labelFontSize: number;
  highlightOpacity: number;
}
```

**StructureLayerData** extends EntityLayerData:
- `structures: Structure[]`
- `groups: Map<string, Structure[]>` — grouped by groupId
- `labelMeasurements: Map<string, RenderedRect>` — pre-measured for overlap detection
- `debugOverlappingLabels: boolean` — when true, label layer renders hidden (overlapping) labels visibly

**ZoneLayerData** extends EntityLayerData:
- `zones: Zone[]`

**PlantingLayerData** extends EntityLayerData:
- `plantings: Planting[]`
- `plantingsByParent: Map<string, Planting[]>`
- `parentMap: Map<string, PlantingParent>`
- `childCount: Map<string, number>`
- `structures: Structure[]`
- `zones: Zone[]`
- `selectedIds: string[]`
- `plantIconScale: number`
- `labelOccluders: RenderedRect[]` — mutable; label layers append as they render

**SystemLayerData** — standalone, no entity base:
- `selectedIds: string[]`
- `structures: Structure[]`
- `zones: Zone[]`
- `plantings: Planting[]`
- `view: ViewTransform`
- `canvasWidth: number`
- `canvasHeight: number`

The `labelOccluders` array in PlantingLayerData is intentionally mutable. The label layer appends to it during rendering so earlier labels occlude later ones, preserving the current priority-based overlap behavior.

### Toggle and Reorder State

Layer visibility and ordering consolidate into two structures in uiStore, replacing the current scattered boolean flags (`showSpacingBorders`, `showSurfaces`, `showMeasurements`, etc.):

```typescript
// uiStore additions
renderLayerVisibility: Record<string, boolean>;
renderLayerOrder: Record<string, string[]>;
setRenderLayerVisible: (layerId: string, visible: boolean) => void;
setRenderLayerOrder: (renderer: string, order: string[]) => void;
```

**Visibility:** `renderLayerVisibility` keyed by layer ID. Absent keys fall back to the layer's `defaultVisible`. Layers marked `alwaysOn` ignore this map.

**Order:** `renderLayerOrder` keyed by renderer name (`'structures'`, `'zones'`, `'plantings'`, `'system'`). Each value is an ordered array of layer IDs. Absent keys fall back to the definition order.

Iteration logic in each renderer:

```
const order = layerOrder[rendererName] ?? defaultOrder;
for (const id of order) {
  const layer = layerMap[id];
  if (layer.alwaysOn || visibility[id] ?? layer.defaultVisible) {
    layer.draw(ctx, data);
  }
}
```

Old individual flags (`showSpacingBorders`, `showFootprintCircles`, `showSurfaces`, `showPlantableArea`, `showMeasurements`, `showContainerOverlays`) are removed. UI that reads those reads `renderLayerVisibility[layerId]` instead.

Debug flags (`debugOverlappingLabels`, `magentaHighlight`) remain in uiStore unchanged. They are diagnostic tools, not render layers — `debugOverlappingLabels` is passed through StructureLayerData and consumed by the label layer's draw function; `magentaHighlight` affects theme color selection, not rendering.

### What Doesn't Change

- The `<canvas>` element stacking in CanvasStack.
- The `LayerRenderer` base class (highlight animation, opacity, invalidation).
- How CanvasStack syncs data into renderers.
- Overlay planting rendering (drag ghost) — transient, stays separate.

## Migration Path

Incremental, one renderer at a time, preserving exact visual output at each step.

**Order:**
1. **ZoneLayerRenderer** — simplest (4 layers, no clipping, no overlap detection). Proves the pattern.
2. **StructureLayerRenderer** — moderate (grouped rendering, two-pass labels, surfaces).
3. **PlantingLayerRenderer** — most complex (container clipping, mutable occluders, container overlays, wall redraws).
4. **SystemLayerRenderer** — promote `renderSelection()` from bare function to LayerRenderer subclass.

**Per-renderer steps:**
1. Define the `TData` type extending `EntityLayerData` (or standalone for system).
2. Define the layer list as `RenderLayer<TData>[]`.
3. Extract each visual element from the monolithic render function into its layer's `draw()`.
4. Replace the monolithic render call with the iterate-and-dispatch loop.
5. Remove old boolean flags from uiStore as they are replaced by `renderLayerVisibility`.

**Testing:** Each step should produce identical visual output. Arrangement and slot computation tests remain valid since the underlying data layer is unchanged.
