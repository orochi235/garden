# App Behavior

Running list of intended application behaviors.

## Canvas

- When dragging an item from the object palette, once the cursor is over the canvas, display a ghosted full-size version of the object underneath the cursor to help the user place it
- While the pan tool is selected, left-click drag on the canvas should pan it
- Right-click drag always pans regardless of tool
- While the zoom tool is selected, left-click on the canvas zooms in around the click point and shift+left-click zooms out; the cursor shows `zoom-in`/`zoom-out` accordingly. The world point under the cursor stays under the cursor across the zoom. Double-clicking the toolbar zoom button resets to fit-view.
- While selecting, if you hold down alt and drag an object, it should clone it (snaps to grid)
- Drag operations require a minimum screen-pixel distance (`DRAG_THRESHOLD_PX`, default 4px) before activating; clicks with a slow release do not trigger a drag or push undo state
- If a planting is dragged and then returned within `DRAG_THRESHOLD_PX` of its original arrangement position, the drag is undone entirely — no undo history entry is created
- When dragging a planting near an empty or partially-filled container for 500ms (configurable via `SNAP_DWELL_MS`), show a ghosted preview of the planting at the container's next available arrangement slot; releasing commits the re-parent (or clone if alt is held); moving away cancels
- Container snap proximity is based on the planting's footprint radius × `SNAP_RADIUS_MULTIPLIER`, with a spatial cull buffer of `CULL_BUFFER_FT`; when multiple containers are candidates, the nearest one wins
- When a planting is dragged out of its container without snapping to a new one, it renders as a free agent: detached from the former parent's walls (no clipping) and positioned freely under the cursor
- Releasing a free-agent planting within one grid cell of its original position snaps it back with no undo entry; releasing it over empty space removes it (undoable); releasing it over a different container's snap target re-parents it (undoable)
- In Draw mode, clicking a structure/zone palette item arms an insert tool: the next drag on the canvas materializes the object at the drag-rect bounds, and the palette tool clears on commit (single-shot)
- Holding Alt/Option while dragging a selection clones the selection at the drop point: originals stay in place, copies are inserted as new objects (undoable). A dim ghost of each prospective clone tracks the cursor during the gesture
- Structure and zone moves snap to the garden's grid cell size; holding Alt while moving bypasses the snap. Plantings ignore this snap (their pose comes from the container's layout strategy)
- Cmd/Ctrl+X cuts the selection: snapshots it onto the clipboard, deletes the originals, and clears the selection (undoable as a single batch)
- Dragging a grouped structure moves all members of its group; a marquee that touches any group member selects all members

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

## Collection

- Each garden has a per-garden **collection** of cultivars; only cultivars in the collection appear in the garden palette and the seed-starting palette
- New gardens start with an empty collection — palettes are empty until the user adds cultivars
- The collection is composed via the modal **Collection Editor**, opened from the menu bar ("Collection…") or the empty-state CTA in any cultivar palette
- The editor's left side is a sortable datagrid of available cultivars (columns: checkbox, swatch, name, variety, species, category, taxonomic) grouped by species — click a column header to sort, click again to toggle direction; species groups stay alphabetized
- The right side is a compact list of cultivars currently in the collection, grouped by species, each with an `×` button to remove
- Cultivars move left → right via checkbox + "Add" button or by dragging a row from the grid onto the right pane; right → left via the per-row `×`. Bulk-remove from the right is not supported
- The grid has a search box (matches cultivar name, species name, taxonomic name) and category chips; species rows are collapsible and have a tri-state checkbox over their visible children
- The grid opens with all species expanded
- Edits in the editor are staged; Save commits, Cancel discards. Cancel + Esc both close (with a "Discard changes?" confirm if dirty); click-outside is disabled
- On Save, if any cultivars being removed are still referenced by plantings or seedlings in the garden, a warning lists them — existing plantings/seedlings remain (the underlying flora database still resolves them) but the cultivar is unavailable for new placements until re-added
- The collection is stored as a self-contained snapshot (`Cultivar[]`) on the garden; loaded saves missing the field default to empty

## Drag & Drop

- Drag ghosts represent the object being dragged, not a generic cursor decoration. They are rendered with the same visual the object will have once dropped (icon, color, footprint), scaled to the size it will appear at on the canvas (i.e., using the canvas's current zoom / pixel-per-inch).
- When a putative placement is visible on the canvas (a preview drawn in-place — e.g., a snapped planting in a parent, a seedling in a target cell, or a row/column/all fill preview on a tray), the cursor-following ghost is hidden. The user sees either the in-canvas putative or the cursor ghost — never both at once.
- This applies wherever a draggable item produces a canvas placement: garden palette (structures, zones, plantings) and seed-starting palette (cultivars onto tray cells, row/column/all affordances).
- Cursor ghosts are created via `createDragGhost(...)` in `src/utils/dragGhost.ts`. New drag flows should use that helper rather than rolling their own DOM ghost element.
- When possible, holding shift during a drag-and-drop operation implies a forced or overriding action — e.g., shift-dropping a cultivar onto an occupied cell or onto a row/column/all target replaces existing seedlings instead of skipping them. New drag flows that have an "override" or "force" variant should bind that variant to shift for consistency.

## Sidebar

- Right-hand panel section titles have less space to the left of the toggle slider and a bit more to the right
- The Almanac panel exposes a "Use my location" button that geolocates the user, looks up USDA hardiness zone + average last spring frost date from a locally bundled 0.5°-resolution grid (CONUS + AK + HI), and writes both into the almanac filters; resolved coordinates, zone, and frost date are shown beneath the button

## Seed Starting

- The app has two modes — Garden and Seed Starting — switched via tabs in the top bar
- Seed Starting mode displays one tray at a time; the active tray is selected via a switcher in the top bar
- Trays are created from a catalog of presets or via the Custom Tray dialog
- Cells are sown by dragging a startable cultivar from the sidebar onto a cell
- Shift-dropping a cultivar on a tray fills all empty cells with that cultivar
- Seed-starting state (trays and seedlings) is saved alongside the garden in the same file under `seedStarting`
- Cultivars are listed in the seed-starting palette only when their resolved `seedStarting.startable` is `true`
- The render-layers panel in seed-starting mode exposes `tray-grid` and `seedling-labels` toggles
- Seedlings with warnings (e.g., placed in a tray whose cell size doesn't match the cultivar's preferred size) are highlighted with a goldenrod outline ring around the icon
- Existing seedlings can be dragged within the tray: dropping on an empty cell moves the seedling, dropping on an occupied cell swaps the two, and dropping outside the tray removes the seedling
- Clicking a seedling selects it; shift- or cmd-clicking another seedling adds/removes it from the selection (multiselect). Clicking an empty cell or the background clears the selection. Selected seedlings render with a dashed blue ring
- Drag from any empty space (between cells, in gutters, outside the tray) draws a marquee rectangle; release selects every seedling whose cell center falls inside. Shift extends the existing selection instead of replacing it. Mirrors the garden-mode marquee style

## Selection and clipboard (Phase 3 canvas-kit migration, 2026-05-01)

- Area-select (marquee) is transient: completing a marquee selection does NOT
  add a history entry. Undo immediately after marquee select is a no-op (or
  restores whatever the previous garden-mutating action was).
- Paste is a single undo step. Pasting N objects produces one history entry
  containing N inserts plus the selection change.
- Plantings paste. Selecting a planting, copying, and pasting now creates a
  sibling planting under the same parent at the same parent-relative
  coordinates. (Pre-Phase-3, plantings were silently dropped from clipboard
  contents.)
- Repeated pastes cascade by one grid cell down-right per paste.

## Selection rides on history (2026-05-01)

- The undo/redo stack captures both garden state and the current selection at
  checkpoint time. Undoing a paste/insert/move/delete restores the selection
  that was active immediately before the change. Marquee select remains
  transient: it does not push history, so undo after a marquee returns to
  whatever selection existed before the marquee started.
- After undo or redo, any selected ids that no longer exist in the restored garden are scrubbed; selection never references deleted objects.

## Clone (Phase 4 canvas-kit migration, 2026-05-01)

- Alt-click-drag duplicates the clicked object at the drop position.
- Clone is a single undo step: one history entry containing the new object's
  insert plus the selection change (was 2 steps for structures/zones in the
  legacy hook — it eagerly added then moved).
- Plantings: the new planting attaches to whichever container the cursor is
  over at drop time. If the cursor isn't over any container, the drop is
  silent (no new planting created).
- Snap-dwell (the 500 ms hover-into-container UX from legacy) is not yet
  ported. Container resolution is immediate based on cursor position.

## Canvas redesign default + debug overlays (Phase 5, 2026-05-03)

- The canvas pipeline rewritten on the weasel `<Canvas>` + Tool primitive is
  now the default and only pipeline; the legacy `?canvas=new` opt-in flag is
  gone, and the legacy `CanvasStack` + `*LayerRenderer` files have been
  deleted. Behavior at the canvas level is intended to be unchanged.
- Click on empty space inside the seed-starting tray view (no seedling under
  the cursor) clears the current selection. Shift-click on empty space leaves
  the current selection alone (legacy parity).
- The URL accepts a `?debug=` query param whose value is a comma-separated
  set of overlay tokens. Tokens supported today: `hitboxes` (red 0.3-alpha
  bbox wireframes around each scene node), `bounds` (cyan dashed rectangle
  around the overall scene), `axes` (red +x / green +y axis lines from the
  origin with `(0,0)` label), `grid` (yellow grid at the model's grid step).
  Tokens are parsed once at page load; reload to change them. Multiple
  tokens combine, e.g. `?debug=hitboxes,axes`.

## Per-id selection-flash opacity (2026-05-04)

- Selection-flash highlights pulse per-id rather than as a single
  aggregated `max()` opacity across the whole selection. Two simultaneously
  flashing entities ramp independently — one can finish fading while
  another is still at full intensity — instead of being yoked to whichever
  started most recently. Garden mode wires this through
  `EricSceneUi.getOpacity(id)`; seed-starting wires it through a per-id
  `getHighlight(id)` callback that `createSeedlingLayers` reads directly
  from `useHighlightStore.computeOpacity`.
