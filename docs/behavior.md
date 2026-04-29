# App Behavior

Running list of intended application behaviors.

## Canvas

- When dragging an item from the object palette, once the cursor is over the canvas, display a ghosted full-size version of the object underneath the cursor to help the user place it
- While the pan tool is selected, left-click drag on the canvas should pan it
- Right-click drag always pans regardless of tool
- While selecting, if you hold down alt and drag an object, it should clone it (snaps to grid)
- Drag operations require a minimum screen-pixel distance (`DRAG_THRESHOLD_PX`, default 4px) before activating; clicks with a slow release do not trigger a drag or push undo state
- If a planting is dragged and then returned within `DRAG_THRESHOLD_PX` of its original arrangement position, the drag is undone entirely — no undo history entry is created
- When dragging a planting near an empty or partially-filled container for 500ms (configurable via `SNAP_DWELL_MS`), show a ghosted preview of the planting at the container's next available arrangement slot; releasing commits the re-parent (or clone if alt is held); moving away cancels
- Container snap proximity is based on the planting's footprint radius × `SNAP_RADIUS_MULTIPLIER`, with a spatial cull buffer of `CULL_BUFFER_FT`; when multiple containers are candidates, the nearest one wins

## Cursor

- In select mode, show an arrow cursor while not over a valid target, and a pointer over a valid target
- Clicking an object makes it the current selection; support multiple selections

## Tools

- Only show the selection outline for the object palette while in draw mode
- When draw mode is active with a selected palette item, clicking and dragging draws that object on the canvas

## Labels

- Only show object labels while the object is selected
- Labels appear below the object in smaller text
- Label text supports a minimal markdown syntax:
  - `*text*` for italic, `**text**` for bold, `***text***` for bold italic
  - `[text]` increases font size by 2px per nesting level, `(text)` decreases by 2px
  - `\n` or literal newlines for line breaks
  - Backslash-escape special characters: `\*`, `\[`, `\]`, `\(`, `\)`, `\\`
  - Labels accept a max width for word wrapping at space boundaries
- Label visibility is controlled by a debug toggle with three modes: all layers, active layer, selection only (default)

## Scale Indicator

- A floating widget in the bottom-left corner draws a darker square over the closest fully visible grid square to the corner, with a caption showing the current scale
- The scale widget snaps to the grid
- While the canvas is being panned or zoomed, fade the scale widget out; fade it back in 0.5s after movement stops

## Structure Groups

- Structures can share a `groupId` to be rendered as a single compound shape
- Grouped structures are filled as one shape with only the outer boundary stroked — no internal borders at overlapping edges
- Groups are nondestructive: each structure retains its own position, size, and identity
- Currently visual-only — no UI for creating/managing groups yet
- Future (Tier 2): groups should unify selection, movement, and act as a single logical entity

## Collision

- Structures in the same layer cannot overlap; moves and placements that would cause a collision are rejected

## Layer Selector

- Text label moves to follow the active plate; plates stay relatively stationary
- Default theme is "Live" (time-based)
- Active layer outlines only appear while hovering over the layer selector

## Patterns

- Zones and surfaces support pattern overlays (hatch, crosshatch, dots, etc.)
- Pattern is passed as a render-time argument, not bound to any object type
- To add a new pattern: add its key to `PatternId`, its params interface to `PatternParamMap`, its defaults to `DEFAULTS`, and its factory to `patternFactories` in `src/canvas/patterns.ts`
- Params are type-safe per pattern — TypeScript will error if you pass params that don't belong to the specified pattern
- Visual reference: `docs/patterns.html`

## Cultivars

- Plant types are defined as static `Cultivar` entries in `src/model/cultivars.ts`
- Each planting references a cultivar by ID; display data (color, footprint, name) is resolved at render time
- To add a new plant type: add an entry to the `cultivars` array and optionally a custom renderer in `src/canvas/plantRenderers.ts`

## Sidebar

- Right-hand panel section titles have less space to the left of the toggle slider and a bit more to the right

## Seed Starting

- The app has two modes — Garden and Seed Starting — switched via tabs in the top bar
- Seed Starting mode displays one tray at a time; the active tray is selected via a switcher in the top bar
- Trays are created from a catalog of presets or via the Custom Tray dialog
- Cells are sown by dragging a startable cultivar from the sidebar onto a cell
- Shift-dropping a cultivar on a tray fills all empty cells with that cultivar
- Seed-starting state (trays and seedlings) is saved alongside the garden in the same file under `seedStarting`
- Cultivars are listed in the seed-starting palette only when their resolved `seedStarting.startable` is `true`
- The render-layers panel in seed-starting mode exposes `tray-grid` and `seedling-labels` toggles
