# Plant Rendering Overhaul

## Summary

Redesign how plants are rendered on the canvas to visually distinguish between a plant's physical footprint and its recommended spacing. Add debug toggles for measurement visualization and lay the architectural groundwork for per-plant render overlays.

## Motivation

Currently, plants render as icons scaled to a single radius derived from `footprintFt`, with an optional spacing overlay (`showSpacing`) that draws a translucent square. There's no visual distinction between what a plant physically occupies vs. how much room it needs. The new rendering makes both dimensions explicit and always visible, giving the user a clearer mental model when placing plants.

## Rendering Model

### Plant rendering (two concentric regions)

Each plant is drawn as two concentric shapes:

1. **Footprint circle** — a circle with diameter equal to `footprintFt` (in world units, scaled by zoom and `plantIconScale`). Filled with the cultivar's `iconBgColor`. The plant's PNG icon is drawn inside, clipped to this circle. This represents the physical body of the plant.

2. **Spacing border** — a dashed outline at `spacingFt` diameter, centered on the same point. This represents the plant's recommended spacing claim. The border shape depends on the parent container:
   - **Rectangular parent** (raised bed, zone): square border
   - **Circular parent** (pot): circular border

### Single-fill behavior

When a container has `arrangement.type === 'single'` and exactly one plant, the current behavior fills the container with the plant icon. This is preserved: the footprint circle expands to fill the container, and no spacing border is drawn (the container itself is the boundary).

### Fallback rendering

When no `iconImage` is available, the fallback remains a colored shape (using `cultivar.color`), but now always clipped to a circle at footprint diameter.

When no `iconBgColor` is available, fall back to `cultivar.color` as the circle fill.

## Overlay Architecture

The `renderPlant` function gains an optional `PlantOverlay` parameter — a bag of per-plant visual overrides:

```typescript
interface PlantOverlay {
  /** Override fill color/opacity for the footprint circle */
  footprintFill?: string;
  footprintOpacity?: number;
  /** Override stroke color/style for the spacing border */
  spacingStroke?: string;
  spacingOpacity?: number;
  /** Arbitrary highlight ring (e.g. conflict warning, companion match) */
  highlightRing?: {
    color: string;
    radius: number; // world feet
    dashPattern?: number[];
  };
}
```

For now, nothing populates this — it exists so future features (conflict highlighting, companion planting indicators, solver output visualization) can style individual plants without changing the renderer's interface.

The overlay is threaded through as an optional map in `PlantingRenderOptions`:

```typescript
interface PlantingRenderOptions extends RenderOptions {
  // ... existing fields ...
  overlays?: Map<string, PlantOverlay>; // keyed by planting ID
}
```

## Debug Toggles

New toggles in the existing Debug panel (`DebugThemePanel` in `LayerPropertiesPanel.tsx`), backed by new fields in `uiStore`:

| Toggle | Default | Effect |
|--------|---------|--------|
| Show spacing borders | on | Draw/hide the dashed spacing border around each plant |
| Show footprint circles | on | Draw/hide the `iconBgColor` circle (icon still renders, just without the bg circle) |
| Show measurements | off | Draw ft values as small text labels next to each plant (footprint and spacing dimensions) |

These replace the existing `showPlantingSpacing` toggle (which currently controls the old translucent-square overlay).

## Files Changed

| File | Change |
|------|--------|
| `src/canvas/plantRenderers.ts` | `renderPlant` gains `iconBgColor` param and circle-clip logic; accepts optional `PlantOverlay`; always clips icon to circle |
| `src/canvas/renderPlantings.ts` | Draws spacing border (shape-aware); passes `iconBgColor` to `renderPlant`; reads overlays from opts; renders measurement labels when enabled |
| `src/canvas/renderOptions.ts` | Add `PlantOverlay` type; add `overlays`, `showFootprintCircles`, `showSpacingBorders`, `showMeasurements` to `PlantingRenderOptions` |
| `src/store/uiStore.ts` | Replace `showPlantingSpacing` with `showSpacingBorders`, `showFootprintCircles`, `showMeasurements`; add setters |
| `src/components/sidebar/LayerPropertiesPanel.tsx` | Replace spacing toggle with three new toggles in Debug section |
| `src/canvas/renderPlantings.ts` (`renderOverlayPlantings`) | Apply same circle-clip + `iconBgColor` rendering during drag; no spacing border needed on drag ghosts |
| Callers passing `showSpacing` | Update to new field names |

## Out of Scope

- Grid overlay during drag (separate feature, depends on layout mode taxonomy)
- Constraint-based layout solver
- Populating `PlantOverlay` from any feature — architecture only
- Changes to `renderIcon` (palette rendering unchanged)
