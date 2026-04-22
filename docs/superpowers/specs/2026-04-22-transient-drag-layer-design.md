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
  /** The object being dragged, with position updated in real time */
  object: Planting | Structure | Zone;
  /** ID of the object to hide from normal rendering (null for clones) */
  hideId: string | null;
  /** Whether the object is snapped to a container slot */
  snapped: boolean;
}
```

- **Moves:** `hideId` is set to the moved object's ID. The garden state is unchanged; the object appears to move because normal rendering hides it and the overlay renders it at the cursor position.
- **Clones:** `hideId` is null. The clone exists only in the overlay until drop. The source container's child count is unaffected, preserving single-plant rendering.
- **Snaps:** When dwell/proximity detection fires, the overlay object's position is updated to the snap slot and `snapped` is set to `true`. The renderer draws it ghosted (reduced opacity, dashed outline). This replaces the separate `GhostPlanting` mechanism.

### Changes to useMoveInteraction

**`activateDrag()`** — Instead of calling `checkpoint()` or `addPlanting()`:
- For moves: snapshot the object from garden state, set `dragOverlay` with `hideId`.
- For clones: create a transient object (using `createPlanting`/etc. for ID generation), set `dragOverlay` with `hideId: null`.
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
- Receives `hideId: string | null` and filters that ID from its plantings array before rendering.
- The `ghost: GhostPlanting | null` field and related code is removed.

**StructureLayerRenderer / ZoneLayerRenderer:**
- Same pattern: receive `hideId`, filter it out.

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

### Child structure handling

When dragging a structure that has children (nested structures), the children need to visually move with the parent. Two options:

**Option A — Multiple overlay entries:** Expand `dragOverlay` to hold an array of objects. The parent and all children are in the overlay, all hidden from garden rendering, all updated together during `move()`.

**Option B — Render-time offset:** Only the parent is in the overlay. Children remain in the garden but the renderer applies a delta offset based on the parent's overlay position vs. its garden position.

Option B is simpler and avoids changing the overlay shape. The delta is just `overlay.x - garden.x` for the parent, applied to each child at render time. Use Option B.

## Scope

This refactor is internal to the drag interaction and rendering pipeline. No changes to:
- Garden data model
- Persistence / serialization
- Palette drag-and-drop (which creates objects on drop, not during drag)
- Keyboard shortcuts or other interactions
