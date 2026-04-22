# Transient Drag Layer

## Problem

Drag operations (move and alt-clone) currently mutate garden state in real time during the drag. This creates several issues:

- **History complexity:** Clone drags must carefully order `checkpoint()` and `addPlanting()` calls to avoid extra undo states. The current code defers clone creation until the drag threshold is exceeded, with `pendingClone`, `isClone`, and `originalPlantingPos` refs managing the timing.
- **Visual artifacts:** When alt-cloning a planting, the source container briefly gains a second child, breaking single-plant-fills-container rendering.
- **Undo quirks:** Snap-back (returning a planting to its original position) is implemented by calling `undo()`, which is fragile and couples drag logic to history management.
- **Ghost duplication:** Snap previews use a separate `GhostPlanting` rendering path that duplicates much of the normal planting rendering logic.

## Design

### Core concept

During a drag, the dragged object lives in a **transient overlay** rather than in the garden state. The garden is only mutated when the drag completes successfully. Cancellation or snap-back simply clears the overlay.

### Overlay state

Add a `dragOverlay` field to `uiStore`:

```ts
interface DragOverlay {
  layer: 'plantings' | 'structures' | 'zones';
  /** The objects being dragged, with positions updated in real time */
  objects: (Planting | Structure | Zone)[];
  /** IDs to hide from normal rendering (empty for clones) */
  hideIds: string[];
  /** Whether the primary object is snapped to a container slot */
  snapped: boolean;
}
```

- **Moves:** `hideIds` contains the moved object's ID (plus children if dragging a parent structure). The garden state is unchanged; the objects appear to move because normal rendering hides them and the overlay renders them at cursor-relative positions.
- **Clones:** `hideIds` is empty. The clone exists only in the overlay until drop. The source container's child count is unaffected, preserving single-plant rendering.
- **Snaps:** When dwell/proximity detection fires, the primary overlay object's position is updated to the snap slot and `snapped` is set to `true`. The renderer draws it ghosted (reduced opacity, dashed outline). This replaces the separate `GhostPlanting` mechanism.

### Changes to useMoveInteraction

**`activateDrag()`** — Instead of calling `checkpoint()` or `addPlanting()`:
- For moves: snapshot the object (and children if applicable) from garden state, set `dragOverlay` with `hideIds`.
- For clones: create a transient object (using `createPlanting`/etc. for ID generation), set `dragOverlay` with `hideIds: []`.
- No garden mutation. No history push.

**`move()`** — Instead of calling `updatePlanting()`/`updateStructure()`/`updateZone()`:
- Update `dragOverlay.object` position directly in uiStore.
- Snap detection still runs; when a snap activates, update overlay position to the snap slot and set `snapped: true`. When the cursor leaves, set `snapped: false` and resume cursor-following.

**`end()`** — Commit the overlay to the garden:
- Call `checkpoint()` (or use `commitPatch`) to push pre-drag state to history.
- For moves: update the object's position in the garden.
- For clones: add the object to the garden.
- For snapped drops: update/add with the snap slot's parent and position.
- Clear `dragOverlay`.
- Result: exactly one history entry.

**Cancel / snap-back:** Clear `dragOverlay`. No `undo()` call needed.

**Refs removed:** `pendingClone`, `isClone`, `originalPlantingPos`, `isAtOriginalPos` all become unnecessary. The overlay's `hideId` distinguishes moves from clones, and snap-back is just clearing the overlay.

### Changes to rendering

**PlantingLayerRenderer:**
- Receives `hideIds: string[]` and filters those IDs from its plantings array before rendering.
- The `ghost: GhostPlanting | null` field and related code is removed.

**StructureLayerRenderer / ZoneLayerRenderer:**
- Same pattern: receive `hideIds`, filter them out.

**Overlay rendering:**
- The overlay object is drawn on the same canvas as its layer (e.g., planting overlay draws on the planting canvas, after the normal plantings). No new canvas element needed.
- When `snapped` is false: render solid at full opacity (normal drag appearance).
- When `snapped` is true: render ghosted (reduced opacity, dashed outline) matching current snap preview style.
- Reuses existing render functions (`renderPlant`, `renderStructures`) with a single-element input.

### What stays the same

- **Dwell/proximity detection:** The timer-based snap logic is unchanged. It decides when and where to snap; it just writes to the overlay instead of a separate ghost field.
- **Hit testing:** No changes. You don't hit-test the object you're dragging.
- **Drag threshold:** Still applies. The overlay is only created when the threshold is exceeded.
- **Container collision detection:** For structures, collision checks still run against garden state (which is correct — the dragged structure is excluded via `hideId`).
- **Child structure movement:** When dragging a parent structure, child structures still need to move with it. This continues to work by updating their positions in the overlay or by batching their updates at commit time.

### Multiple overlay objects

The overlay holds an array of objects rather than a single object. This handles:
- Dragging a parent structure with its children (all move together)
- Future multi-select drag (arbitrary set of objects)

All overlay objects are hidden from normal rendering and updated together during `move()`. The `hideId` field becomes `hideIds: string[]` accordingly.

### Palette drag unification

Palette drags currently use the browser's native drag API (`draggable`, `onDragOver`, `onDrop`) with a CSS-positioned ghost div for preview. This is replaced with pointer-event-based dragging that uses the same overlay mechanism as canvas drags.

**Changes to palette items:**
- Replace `draggable` / `onDragStart` / `onDragEnd` with `onPointerDown`.
- On pointer down, capture the pointer and begin tracking.
- Once the cursor enters the canvas area (or crosses a drag threshold), create the transient object in the overlay with `hideIds: []` (it's a new object, nothing to hide).

**Changes to CanvasStack:**
- Remove `handleDragOver`, `handleDragLeave`, `handleDrop`, the `dragGhost` state, and the `ghostStyle` CSS ghost div.
- Palette drops are handled the same as clone drops: `end()` commits the overlay object to the garden.

**Changes to App:**
- Remove `draggingEntry` state and the prop plumbing between `ObjectPalette` and `CanvasStack`.

**Behavior differences from current palette drag:**
- The object renders on the canvas (via the overlay) during the drag instead of as a CSS div. This means it respects zoom, grid snapping, and layer rendering.
- For plantings, snap detection (dwell/proximity) works during palette drag, giving a live preview of where the plant will land in a container.
- For structures/zones, the object snaps to the grid in real time.
- If the drag ends outside a valid drop target (e.g., planting not over a container), the overlay is cleared with no garden mutation.

## Scope

This refactor covers:
- Canvas drag interactions (move, clone, snap)
- Palette-to-canvas drag interactions
- Ghost/preview rendering unification

No changes to:
- Garden data model
- Persistence / serialization
- Keyboard shortcuts or other interactions
