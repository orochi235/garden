# Input Bindings

All keyboard shortcuts, mouse interactions, and modifier key combinations.

## Keyboard Shortcuts

| Key | Action | File |
|-----|--------|------|
| Cmd+Z | Undo | `src/actions/editing/undo.ts` |
| Cmd+Shift+Z | Redo | `src/actions/editing/redo.ts` |
| Delete / Backspace | Delete selected objects | `src/actions/editing/delete.ts` |
| Cmd+C | Copy selection | `src/actions/editing/copy.ts` |
| Cmd+V | Paste | `src/actions/editing/paste.ts` |
| Cmd+A | Select all in active layer | `src/actions/editing/selectAll.ts` |
| Cmd+D | Duplicate selected objects | `src/actions/objects/duplicate.ts` |
| Cmd+0 | Reset view (fit garden) | `src/actions/view/resetView.ts` |
| Tab | Cycle to next object in layer | `src/actions/editing/cycleSelection.ts` |
| Shift+Tab | Cycle to previous object | `src/actions/editing/cycleSelection.ts` |
| R | Rotate selected 90° clockwise | `src/actions/objects/rotate.ts` |
| Shift+R | Rotate 90° counter-clockwise | `src/actions/objects/rotate.ts` |
| Backtick (\`) | Cycle view mode | `src/actions/view/cycleViewMode.ts` |
| Arrow Up | Previous visible layer | `src/actions/layers/cycleLayer.ts` |
| Arrow Down | Next visible layer | `src/actions/layers/cycleLayer.ts` |
| Escape | Cancel plot/move, clear overlay | `src/canvas/CanvasStack.tsx` |
| Cmd+Shift+F | Toggle FPS meter | `src/components/FpsMeter.tsx` |

## Mouse Interactions

### Canvas (Select Mode)

| Input | Action |
|-------|--------|
| Left-click | Select object (hit-tests plantings, active layer, then all layers) |
| Shift+click | Add to selection |
| Alt+click+drag | Clone object and drag the clone |
| Cmd+double-click | Center and zoom-to-fit on clicked object |
| Right-click+drag | Pan canvas |
| Drag object | Move with grid snap |
| Drag resize handle | Resize structure/zone (8 handles: n/s/e/w/ne/nw/se/sw) |

### Canvas (Draw Mode)

| Input | Action |
|-------|--------|
| Left-click+drag | Plot new structure/zone |

### Canvas (Pan Mode)

| Input | Action |
|-------|--------|
| Left-click+drag | Pan canvas |

### Scroll Wheel

| Input | Action |
|-------|--------|
| Scroll | Zoom in/out (centered on cursor) |
| Shift+scroll | Scroll horizontally |
| Cmd+scroll | Scroll vertically |

### Palette

| Input | Action |
|-------|--------|
| Drag item | Create and place object on canvas |
| Click structure/zone | Toggle plotting tool |

### Layer Selector

| Input | Action |
|-------|--------|
| Click tile | Activate layer (show if hidden) |
| Scroll wheel | Cycle through visible layers |

### View Toolbar

| Input | Action |
|-------|--------|
| Click mode button | Switch view mode |
| Double-click Zoom button | Reset zoom to fit garden |

### Sidebar Panel Resize

| Input | Action |
|-------|--------|
| Drag left handle | Resize palette (160-400px) |
| Drag right handle | Resize sidebar (160-400px) |

## Modifier Keys

| Modifier | Context | Effect |
|----------|---------|--------|
| Alt | Drag/resize/plot | Disable grid snapping (free positioning) |
| Shift | Click object | Add to multi-selection |
| Shift | Scroll wheel | Horizontal pan |
| Cmd | Scroll wheel | Vertical pan |
| Cmd | Double-click | Zoom to fit object |
| Alt | Click+drag object | Clone and drag |

## View Modes

| Mode | Cursor | Left-click behavior |
|------|--------|---------------------|
| Select | default/pointer | Select, move, resize objects |
| Draw | crosshair | Plot new structures/zones |
| Pan | grab/grabbing | Pan viewport |
| Zoom | zoom-in | (scroll zooms) |

## Constants

- Drag threshold: 4px before drag begins
- Zoom range: 10-200
- Zoom factor: 1.1x per scroll tick
- Minimum object size: 0.25 ft
