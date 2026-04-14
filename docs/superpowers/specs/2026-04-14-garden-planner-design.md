# Garden Layout Planner — Design Spec

## Overview

A browser-based garden layout planner that lets users design garden spaces on a top-down orthogonal grid. Users drag objects from a palette onto a layered canvas, arrange and resize them, and save/load their designs as self-contained files. Built as a static SPA with no backend.

## Goals

- Reusable across seasons and properties
- Drag-and-drop-first interaction model (palette → canvas)
- Layered system that supports stacking and explicit containment
- Start simple (labels only for plants), but extensible to full garden planning metadata
- Local-first persistence, architectured so a backend could be added later

## Tech Stack

- **React 19** + **TypeScript 6**
- **Vite** (latest stable — verify against npm at implementation time)
- **Zustand** for state management
- **HTML Canvas** — stacked canvases for rendering layers
- **CSS Modules** or plain CSS for UI chrome (no heavy UI library)
- Static SPA, no backend

## Data Model

All measurements stored internally in **feet** (float). Display converts to the user's chosen unit.

### Garden

Top-level container.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (UUID) | |
| `version` | number | Schema version, starts at 1 |
| `name` | string | |
| `widthFt` | number | Garden width in feet |
| `heightFt` | number | Garden height in feet |
| `gridCellSizeFt` | number | Default 1 |
| `displayUnit` | `"ft"` \| `"in"` \| `"m"` \| `"cm"` | User-facing unit |
| `blueprint` | Blueprint \| null | Reference image |
| `structures` | Structure[] | |
| `zones` | Zone[] | |
| `plantings` | Planting[] | |

### Blueprint

Reference/tracing layer for satellite photos, sketches, etc.

| Field | Type | Notes |
|-------|------|-------|
| `imageData` | string | Base64 data URI |
| `x` | number | Position in feet |
| `y` | number | Position in feet |
| `scale` | number | Scale factor |
| `opacity` | number | 0–1 |

### Structure

Physical objects: raised beds, pots, fences, paths, patios, sheds, etc.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (UUID) | |
| `type` | string | `"raised-bed"`, `"pot"`, `"fence"`, `"path"`, `"patio"`, etc. |
| `x` | number | Position in feet (float, allows sub-grid) |
| `y` | number | Position in feet |
| `width` | number | In feet |
| `height` | number | In feet |
| `rotation` | number | Degrees |
| `color` | string | Hex color |
| `label` | string | |
| `zIndex` | number | Render order within layer, default 0 |
| `parentId` | string \| null | Explicit containment — opt-in |
| `snapToGrid` | boolean | Default true |

### Zone

Abstract planting areas. May or may not coincide with a structure.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (UUID) | |
| `x` | number | |
| `y` | number | |
| `width` | number | |
| `height` | number | |
| `color` | string | |
| `label` | string | |
| `zIndex` | number | Default 0 |
| `parentId` | string \| null | Explicit containment — opt-in |
| `soilType` | string \| null | Future extensibility |
| `sunExposure` | string \| null | Future extensibility |

### Planting

Plants placed within zones.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (UUID) | |
| `zoneId` | string | Required — must belong to a zone |
| `x` | number | Relative to zone origin |
| `y` | number | Relative to zone origin |
| `name` | string | e.g., "Tomato" |
| `color` | string | |
| `icon` | string \| null | Future: icon identifier |
| `variety` | string \| null | Future extensibility |
| `spacingFt` | number \| null | Future: for spacing guides |

### Containment

- Structures and zones have an optional `parentId` pointing to another structure or zone.
- Containment is **explicit and opt-in** — spatial overlap alone does not create a relationship.
- Moving a parent moves its children. Moving a child moves it independently.
- The UX for creating/breaking containment (e.g., a grouping gesture or menu action) will be designed in a later iteration.

## Layer System

Rendering order, bottom to top:

1. **Ground** — grid background, fill color. Not directly editable.
2. **Blueprint** — reference images. Lockable, excluded from data exports.
3. **Structures** — solid fills and borders.
4. **Zones** — semi-transparent fills so structures show through.
5. **Plantings** — icons/labels within zones.

Additional **UI-only layers** (not persisted, render-time only):
- Selection highlights and resize handles
- Drag preview (ghost of object being placed)
- Grid overlay
- Hover states and tooltips

### Layer Panel (right sidebar)

Per layer:
- Visibility toggle (eye icon)
- Opacity slider
- Lock toggle (prevent edits)
- Active layer highlight

Dragging from the palette auto-selects the correct layer based on object type. Inactive layers dim when another layer is active.

## UI Layout

```
┌─────────────────────────────────────────────────┐
│  Menu Bar: Garden Planner    File  Edit  View    │
├──────┬──────────────────────────────┬────────────┤
│      │                              │ Properties │
│  O   │                              │            │
│  b   │                              │  Width     │
│  j   │        Canvas                │  Height    │
│  e   │        (stacked canvases)    │  Label     │
│  c   │                              │  Color     │
│  t   │                              │────────────│
│      │                              │ Layers     │
│  P   │                              │            │
│  a   │                              │  ☑ Ground  │
│  l   │                              │  ☑ Bluep.  │
│  e   │                              │  ☑ Struct  │
│  t   │                              │  ☑ Zones   │
│  t   │                              │  ☑ Plants  │
│  e   │                              │            │
├──────┴──────────────────────────────┴────────────┤
│  Status: Grid 1ft · Zoom 100% · Selected: ...   │
└─────────────────────────────────────────────────┘
```

- **Left panel:** Object palette — categorized, searchable library of draggable objects (structures, zones, plantings). Drag from palette onto canvas to place.
- **Center:** Stacked canvas elements. One per render layer group, plus UI overlay canvases.
- **Right panel:** Properties (when object selected) or garden settings (when nothing selected). Layer panel below.
- **Status bar:** Grid size, zoom level, selection info.
- Floating/detachable panels planned for a future iteration.

## Canvas Interaction

### Core Model

The primary interaction is **drag from palette to canvas**. Select/move is always active — no explicit tool mode switching needed. A select/move tool exists conceptually as the default state (like Illustrator's selection tool) and can be made explicit later.

### Placing Objects

- Drag an object from the left palette onto the canvas
- Object snaps to grid on drop (if `snapToGrid` is true)
- Lands on the appropriate layer based on object type

### Manipulating Objects

- **Click** on canvas object → select it
- **Drag** selected object → move it
- **Resize handles** appear on selection (corners and edges)
- **Shift+click** → multi-select
- **Right-click drag** on canvas → pan
- **Scroll wheel** → zoom in/out
- **Alt/Option hold** while dragging → temporarily disable grid snap

### Grid Snap

- On by default per object (`snapToGrid: true`)
- Objects snap to grid cell edges when placing, moving, or resizing
- Sub-grid positioning allowed when snap is disabled
- Grid cell size configurable at the garden level

### Future Interaction Work

- Explicit select/move tool mode
- Grouping UX (for containment relationships)
- Hover-drag gesture for placing objects inside containers
- Keyboard shortcuts

## Properties Panel

### When Object Selected

**Common fields (all object types):**
- Label (text input)
- Position: x, y (in display units)
- Size: width, height (in display units)
- Color picker
- zIndex (up/down reorder)
- Parent (name if attached, detach button)

**Structure-specific:**
- Type dropdown (raised bed, pot, fence, path, patio, shed, etc.)

**Zone-specific:**
- Soil type (placeholder, empty for now)
- Sun exposure (placeholder, empty for now)

**Planting-specific:**
- Plant name
- Variety (placeholder, disabled for now)

### When Nothing Selected

Garden-level settings: name, dimensions (width × height), grid cell size, display unit.

## File Format & Persistence

### Save Format

Single `.garden` file (JSON). Self-contained — blueprint images stored as base64 data URIs.

```json
{
  "version": 1,
  "name": "Backyard 2026",
  "widthFt": 40,
  "heightFt": 25,
  "gridCellSizeFt": 1,
  "displayUnit": "ft",
  "blueprint": null,
  "structures": [],
  "zones": [],
  "plantings": []
}
```

### Persistence Strategy

- **Autosave:** Persist to localStorage on every change. Protects against accidental tab close.
- **Save:** Export to `.garden` file via browser download.
- **Load:** Import via file picker or drag-and-drop onto the app window. Replaces localStorage state.
- **Version field:** Enables schema migrations as the format evolves.

## Visual Style

Earthy warmth with bright accents and a somewhat playful feel. Specific palette and styling to be refined during implementation — the user intends to tweak this. Start with warm earth tones for chrome, natural greens/browns for garden objects, and friendly rounded UI elements.

## Project Structure

```
src/
  components/       # React — palette, sidebar, layer panel, menu bar, status bar
  canvas/           # Canvas rendering logic per layer
  store/            # Zustand stores (garden data, UI state, tool state)
  model/            # TypeScript types and interfaces
  utils/            # Grid math, coordinate transforms, unit conversion, file I/O
  App.tsx
  main.tsx
```

## Out of Scope (Future)

- Companion planting rules and validation
- Planting date tracking, watering schedules
- Backend / user accounts / sharing
- SVG export
- Undo/redo
- Floating/detachable panels
- Keyboard shortcut system
- Advanced grouping UX
- Print layout
