# Drag Lab Design Spec

## Overview

A standalone Vite test page for experimenting with different layout strategies for placing items into containers. Renders a tiled grid of independent **experiment workspaces**, each with identical UI but independent state, allowing side-by-side comparison of different layout approaches.

## Entry Points

- `drag-lab.html` — standalone HTML page at project root
- `src/drag-lab.tsx` — React entrypoint
- Added as a second input in `vite.config.ts` for multi-page Vite support

## Core Abstractions

### LabItem

A draggable item — either a generic proxy or a real cultivar.

```ts
interface LabItem {
  id: string;
  label: string;
  radiusFt: number;
  color: string;
  x: number;
  y: number;
  cultivarId?: string; // present if sourced from real cultivar data
}
```

### LayoutStrategy

Each layout strategy is a self-contained plugin implementing this interface. Strategies own all internal concepts — the lab only calls these hooks.

```ts
interface DragFeedback {
  // What to render during drag (snap preview, cell highlight, ghost, etc.)
  render(ctx: CanvasRenderingContext2D, bounds: Rect): void;
}

interface DropResult {
  item: LabItem;       // item with final position
  state: any;          // updated strategy state
}

interface ReflowResult {
  items: LabItem[];    // repositioned items
  state: any;          // updated strategy state
}

interface ConfigField {
  key: string;
  label: string;
  type: 'slider' | 'dropdown' | 'checkbox';
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
  default: any;
}

interface LayoutStrategy {
  name: string;
  render(ctx: CanvasRenderingContext2D, bounds: Rect, items: LabItem[], state: any): void;
  onDragOver(bounds: Rect, pos: Point, items: LabItem[], state: any): DragFeedback | null;
  onDrop(bounds: Rect, pos: Point, item: LabItem, items: LabItem[], state: any): DropResult;
  onRemove?(items: LabItem[], removed: LabItem, state: any): ReflowResult;
  defaultConfig(): any;
  configSchema(): ConfigField[];
}
```

### Initial Strategies

1. **Slot-based** — wraps existing `computeSlots` from `src/model/arrangement.ts`. Generates slots via rows/grid/ring configs. Items snap to nearest unoccupied slot on drop. Sub-dropdown selects arrangement type (rows, grid, ring, single). Config sliders map to arrangement params (spacing, margin, direction, count, etc.).

2. **Subgrid** — partitions the container into a configurable NxM grid of cells. Items occupy cells rather than arbitrary positions. Drag feedback highlights the target cell. Config: column count, row count, cell gap.

3. **Free-form** — items land exactly where dropped. No snapping, no reflow. Minimal config.

4. **Snap-point** — strategy exposes a set of arbitrary snap points (configurable pattern). Items magnetize to the nearest snap point within a threshold. Config: snap threshold, point pattern (corners, edges, center, custom).

## Workspace UI

Each workspace tile contains:

### Canvas Area
- Renders the container rectangle
- Renders placed items and strategy visuals (slots, grid lines, snap points) via `strategy.render()`
- Renders drag feedback via `strategy.onDragOver()` during drag
- Container dimensions adjustable via sliders (width, height in ft)
- Container shape choosable (rectangle, circle)

### Controls Panel
- **Strategy dropdown** — selects which `LayoutStrategy` to use. Switching strategies preserves items but reflows them through the new strategy.
- **Config sliders/controls** — dynamically generated from `strategy.configSchema()`. Each strategy exposes its own set of controls.
- **Container sliders** — width (ft), height (ft)

### Toolbar
- **Close** — removes this workspace from the grid
- **Save** — saves full workspace state to localStorage, prompts for a name
- **Load** — dropdown of previously saved states
- **Reset** — clears this workspace to defaults

### Item Palette
- **Generic items** — colored circles with a size slider (radiusFt). Click or drag to add to the container.
- **Real cultivars** — toggle to show actual cultivar data from `src/model/cultivars.ts`. Items use real name and spacing values.
- Toggle between generic/cultivar modes

## Top-Level Page

- **Add workspace** button — creates a new workspace tile with default state
- Workspaces render in a responsive CSS grid, tiling/wrapping as the viewport allows
- Starts with one default workspace on first load

## Persistence

- Each workspace serializes its full state to localStorage:
  - Strategy name + config
  - Container dimensions and shape
  - Placed items with positions
  - Palette mode (generic vs cultivar)
- Keyed by workspace ID
- **Reset** button per workspace clears that workspace's saved state
- **Global reset** button clears all drag lab localStorage data
- States survive browser refresh; clearing localStorage is easy and explicit

## File Structure

```
drag-lab.html                          # HTML entry point
src/drag-lab.tsx                       # React entrypoint, mounts DragLab
src/drag-lab/
  DragLab.tsx                          # Top-level: workspace grid + add button
  Workspace.tsx                        # Single workspace: canvas + controls + palette
  types.ts                             # LabItem, LayoutStrategy, ConfigField, etc.
  useWorkspaceStore.ts                 # Zustand store for workspace state + persistence
  strategies/
    index.ts                           # Strategy registry
    slot-based.ts                      # Wraps computeSlots
    subgrid.ts                         # Cell-based partitioning
    free-form.ts                       # No-snap free placement
    snap-point.ts                      # Magnetic snap points
  ItemPalette.tsx                      # Generic + cultivar item palette
  CanvasRenderer.tsx                   # Canvas component with drag handling
```

## Dependencies

- Reuses from main app: `computeSlots`, `defaultArrangement`, `Arrangement` types from `src/model/arrangement.ts`; cultivar data from `src/model/cultivars.ts`; `Rect`/`Point` types
- No new npm dependencies — React, Zustand, and Canvas API are sufficient
