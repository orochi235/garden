# Layer Widget Design

Inline SVG React component that renders the garden planner's layer stack as a 3D rolodex-style widget, replacing the flat layer list in the sidebar.

## Architecture

### Files

| File | Purpose |
|------|---------|
| `src/components/sidebar/layerWidgetLayout.ts` | Pure functions: `computeLayout()`, tile math, easing. No React dependency. |
| `src/components/sidebar/LayerWidget.tsx` | React component: reads store, renders SVG, handles input and animation. |
| `src/components/sidebar/LayerWidget.module.css` | Scoping and cursor styles. |

### Why this split

The layout math is the most complex part and benefits from being independently testable. Keeping it in a pure module means it can be unit tested with plain values (no DOM, no React) and reused if the widget ever appears in a different context.

## 3D Spatial Model

Tiles are arranged on a circular arc in the YZ plane. The camera views from a slight elevation angle. This produces the characteristic "rolodex" stacking where tiles above and below the active tile fan out with increasing tilt.

### Core math

```
arcR = halfW * 3 / curvePct          // arc radius from curvature
arcAngle = relativeIndex * gapRad     // plate's angle on arc
y3d = arcR * sin(arcAngle)            // vertical position on arc
z3d = arcR * (1 - cos(arcAngle))      // depth on arc
screenY = centerY + y3d * cos(camRad) + z3d * sin(camRad)  // orthographic projection
viewAngle = |plateTilt| + camRad      // combined view angle
tiltY = halfW * sin(viewAngle)        // diamond half-height
```

### Endcap bias

Edge tiles get extra tilt (applied only to `plateTilt`, not position) so the stack edges fan out visually without affecting spacing.

### Normalization

After computing raw positions, tile Y coordinates are scaled to fit within the SVG viewBox. Tilts are not scaled -- they derive from view angles and must remain physically correct. A camera-follow parameter (0-100%) blends the centering anchor between the stack midpoint and the active tile's position.

## Baked Parameters

These are constants, not configurable at runtime:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `HALF_W` | 44 | Diamond half-width (SVG units) |
| `SIDE_THICK` | 2 | Side face thickness |
| `ACTIVE_THICK_RATIO` | 1.0 | Active tile thickness multiplier |
| `CAMERA_ANGLE` | 5 | Camera elevation (degrees) |
| `CAM_FOLLOW` | 0.5 | Camera tracking blend (0 = stack center, 1 = active tile) |
| `ENDCAP_BIAS` | 0.5 | Extra edge tilt (fraction of gap angle) |
| `PLATE_GAP` | 5 | Angular spacing between plates (degrees) |
| `ARC_CURVE` | 2.0 | Arc curvature (multiplier, 0 = flat) |
| `TILE_OPACITY` | 0.85 | Inactive tile fill opacity |
| `SHADOW_BLUR` | 2 | Shadow blur radius |
| `SHADOW_OFF` | 2 | Shadow vertical offset |
| `SHADOW_ALPHA` | 0.5 | Shadow opacity |
| `FLIP_SHADOW` | true | Shadows point toward active tile |
| `ANIM_DUR` | 300 | Transition duration (ms) |
| `ANIM_EASE` | cubic ease-out | `1 - (1 - t)^3` |

No stroke, no gradient fill, no perspective projection, no clipping.

## Layer Data

Five layers, mapping to the existing `LayerId` type:

| ID | Label | Color | Dark | Side1 | Side2 |
|----|-------|-------|------|-------|-------|
| `plantings` | Plantings | `#4A7C59` | `#3a6a48` | `#3f6d4e` | `#356042` |
| `zones` | Zones | `#7FB069` | `#5c8a4a` | `#6a9a56` | `#5c8a4a` |
| `structures` | Structures | `#D4A843` | `#a8832a` | `#c09530` | `#a8832a` |
| `blueprint` | Blueprint | `#4A7CAF` | `#35608a` | `#3f6d9a` | `#35608a` |
| `ground` | Ground | `#8B7355` | `#6b5540` | `#7a6349` | `#6b5540` |

Order is fixed (index 0 = plantings at top, index 4 = ground at bottom).

## Rendering

### SVG structure

The component renders an `<svg>` with a fixed `viewBox="0 0 {svgW} 120"` that scales to fill its container width. `svgW = HALF_W * 2 + padding`.

### Z-ordering

Tiles are painted back-to-front using actual `z3d` depth. The active tile is always drawn last (on top).

### Per-tile rendering

Each non-active tile:
1. Outer `<g>` with shadow filter
2. `<g transform="translate(cx, y)">` for positioning
3. Side face polygons (two trapezoids, direction based on `dir`)
4. Top face diamond polygon

Active tile: same but no clip group, drawn last.

### Side faces

Projected thickness per tile: `sideThick * (isActive ? activeThickRatio : 1) * cos(viewAngle)`. Direction (`dir`) determines whether side faces extend above or below the diamond:
- `dir > 0` (below active): sides hang down
- `dir < 0` (above active): sides extend up

### Shadows

Per-tile `<feDropShadow>` filters. Shadow offset direction follows `dir` (toward active when `flipShadow` is true). Offset and blur scaled by `angleFactor = max(0.3, 1 - sin(viewAngle) * 0.5)` so more edge-on tiles cast subtler shadows.

## Animation

Transitions use `requestAnimationFrame`, not React state updates per frame.

### Flow

1. User clicks a tile (or scrolls/presses arrow key)
2. Component captures current layout as `oldLayout`
3. Sets new `activeIndex`, computes `newLayout`
4. Starts rAF loop that interpolates tile positions: `y = old.y + (new.y - old.y) * t`, same for `tilt`
5. Each frame writes SVG markup directly to the container ref's `innerHTML`
6. On completion, triggers a final React re-render for the static state

### Easing

Cubic ease-out: `t' = 1 - (1 - t)^3`

### Guards

- `animating` flag prevents re-entry during transition
- `cancelAnimationFrame` on new switch if one is in progress

## Input Handling

| Input | Action |
|-------|--------|
| Click on tile | Switch to that layer |
| Mouse wheel on widget | Next/previous layer |
| ArrowUp / ArrowDown (when focused) | Next/previous layer |

Click targets are the tile `<g>` elements. No separate hit areas needed -- SVG polygon fill regions are sufficient at this size.

## Integration

### Sidebar placement

`LayerWidget` replaces `LayerPanel` in the sidebar layout. The existing `PropertiesPanel` and `LayerPropertiesPanel` remain unchanged.

In `Sidebar.tsx`:
```tsx
import { LayerWidget } from './LayerWidget';

export function Sidebar() {
  return (
    <div className={styles.sidebar}>
      <LayerWidget />
      <div className={styles.divider} />
      <PropertiesPanel />
      <div className={styles.divider} />
      <LayerPropertiesPanel />
    </div>
  );
}
```

### Store interaction

Reads from `useUiStore`:
- `activeLayer: LayerId` -- current active layer
- `setActiveLayer(id: LayerId)` -- switch active layer

The widget maps `LayerId` to index (0-4) for internal math and maps back on user interaction.

### Sizing

The SVG fills the sidebar width via `width="100%"` with `preserveAspectRatio="xMidYMid meet"`. Vertical height is determined by the viewBox aspect ratio. No explicit height prop needed.

## What This Design Does Not Include

- Layer visibility toggles (eye icons) -- can be added later as an overlay or separate row
- Drag-to-reorder layers
- Runtime parameter tuning (parameters are baked constants)
- Perspective projection or clipping (both disabled in the selected configuration)
- Accessibility labels beyond basic click targets (can be added incrementally)

## Reference

Interactive prototype: `layer-lab.html` in project root (also deployed at GitHub Pages).
