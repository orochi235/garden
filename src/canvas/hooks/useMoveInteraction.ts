import { useRef } from 'react';
import { findSnapContainer } from '../findSnapContainer';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { screenToWorld, snapToGrid } from '../../utils/grid';
import { structuresCollide } from '../../utils/collision';

/** How long the cursor must dwell over a container before snapping (ms). */
export const SNAP_DWELL_MS = 500;

/** Minimum screen-pixel distance before a mousedown becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

export interface PutativeSnap {
  containerId: string;
  containerKind: 'structure' | 'zone';
  /** Slot position relative to the target container */
  slotX: number;
  slotY: number;
}

export function useMoveInteraction(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onSnapChange?: () => void,
) {
  const isPending = useRef(false);
  const isMoving = useRef(false);
  const moveStart = useRef({ worldX: 0, worldY: 0, objX: 0, objY: 0 });
  const screenStart = useRef({ x: 0, y: 0 });
  const moveObjectId = useRef<string | null>(null);
  const moveObjectLayer = useRef<string | null>(null);
  const forceSnap = useRef(false);
  const isClone = useRef(false);
  const pendingClone = useRef<{
    parentId: string;
    x: number;
    y: number;
    cultivarId: string;
    parentWorldX: number;
    parentWorldY: number;
  } | null>(null);
  const childStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Original planting position for snap-back detection
  const originalPlantingPos = useRef<{ relX: number; relY: number; parentId: string } | null>(null);
  const isAtOriginalPos = useRef(false);

  // Container snap state
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellContainerId = useRef<string | null>(null);
  const putativeSnap = useRef<PutativeSnap | null>(null);

  function clearDwell() {
    if (dwellTimer.current !== null) {
      clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
    dwellContainerId.current = null;
  }

  function clearSnap() {
    clearDwell();
    putativeSnap.current = null;
  }

  function activateDrag() {
    isPending.current = false;
    isMoving.current = true;

    // Create deferred clone before checkpoint so undo reverts both in one step
    if (pendingClone.current) {
      const clone = pendingClone.current;
      const { addPlanting } = useGardenStore.getState();
      addPlanting({ parentId: clone.parentId, x: clone.x, y: clone.y, cultivarId: clone.cultivarId });
      const newPlantings = useGardenStore.getState().garden.plantings;
      const created = newPlantings[newPlantings.length - 1];
      moveObjectId.current = created.id;
      moveStart.current.objX = clone.parentWorldX + created.x;
      moveStart.current.objY = clone.parentWorldY + created.y;
      useUiStore.getState().select(created.id);
      pendingClone.current = null;
    } else {
      useGardenStore.getState().checkpoint();
    }

    // Capture original planting position for snap-back
    originalPlantingPos.current = null;
    isAtOriginalPos.current = false;
    if (moveObjectLayer.current === 'plantings' && moveObjectId.current) {
      const planting = useGardenStore.getState().garden.plantings.find(
        (p) => p.id === moveObjectId.current,
      );
      if (planting) {
        originalPlantingPos.current = {
          relX: planting.x,
          relY: planting.y,
          parentId: planting.parentId,
        };
      }
    }

    // Capture initial positions of child structures so they move with the parent
    childStartPositions.current.clear();
    if (moveObjectLayer.current === 'structures') {
      for (const s of useGardenStore.getState().garden.structures) {
        if (s.parentId === moveObjectId.current) {
          childStartPositions.current.set(s.id, { x: s.x, y: s.y });
        }
      }
    }
  }

  function start(
    worldX: number,
    worldY: number,
    objId: string,
    layer: string,
    objX: number,
    objY: number,
    alwaysSnap = false,
    cloneData?: { parentId: string; x: number; y: number; cultivarId: string; parentWorldX: number; parentWorldY: number },
  ) {
    isPending.current = true;
    isMoving.current = false;
    moveStart.current = { worldX, worldY, objX, objY };
    moveObjectId.current = objId;
    moveObjectLayer.current = layer;
    forceSnap.current = alwaysSnap;
    isClone.current = !!cloneData;
    pendingClone.current = cloneData ?? null;
    clearSnap();

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const { panX, panY, zoom } = useUiStore.getState();
      const [sx, sy] = [
        panX + worldX * zoom,
        panY + worldY * zoom,
      ];
      screenStart.current = { x: sx, y: sy };
    }
  }

  function move(e: React.MouseEvent) {
    if (!moveObjectId.current) return false;
    if (!isPending.current && !isMoving.current) return false;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;

    // Check drag threshold before activating
    if (isPending.current) {
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const dx = screenX - screenStart.current.x;
      const dy = screenY - screenStart.current.y;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        return true; // Consume event but don't move yet
      }
      activateDrag();
    }
    const { panX, panY, zoom } = useUiStore.getState();
    const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, {
      panX,
      panY,
      zoom,
    });
    const deltaX = worldX - moveStart.current.worldX;
    const deltaY = worldY - moveStart.current.worldY;
    const newX = moveStart.current.objX + deltaX;
    const newY = moveStart.current.objY + deltaY;
    const { garden, updateStructure, updateZone } = useGardenStore.getState();
    const cellSize = garden.gridCellSizeFt;
    const freeMove = e.altKey && !forceSnap.current;
    const snappedX = freeMove ? newX : snapToGrid(newX, cellSize);
    const snappedY = freeMove ? newY : snapToGrid(newY, cellSize);
    if (moveObjectLayer.current === 'structures') {
      const moving = garden.structures.find((s) => s.id === moveObjectId.current);
      if (moving) {
        const moved = { ...moving, x: snappedX, y: snappedY };
        const childIds = new Set(childStartPositions.current.keys());
        const others = garden.structures.filter(
          (s) => s.id !== moveObjectId.current && !childIds.has(s.id),
        );
        if (!structuresCollide(moved, others)) {
          updateStructure(moveObjectId.current, { x: snappedX, y: snappedY });
          // Move child structures by the same delta
          const dx = snappedX - moveStart.current.objX;
          const dy = snappedY - moveStart.current.objY;
          for (const [childId, startPos] of childStartPositions.current) {
            updateStructure(childId, {
              x: startPos.x + dx,
              y: startPos.y + dy,
            });
          }
        }
      }
    } else if (moveObjectLayer.current === 'zones') {
      updateZone(moveObjectId.current, { x: snappedX, y: snappedY });
    } else if (moveObjectLayer.current === 'plantings') {
      const planting = garden.plantings.find((p) => p.id === moveObjectId.current);
      if (planting) {
        // If we have an active putative snap, check whether cursor moved away
        if (putativeSnap.current) {
          const snap = findSnapContainer(worldX, worldY, planting, garden);
          if (!snap || snap.id !== putativeSnap.current.containerId) {
            // Moved away from snapped container — cancel and resume cursor-following
            clearSnap();
            onSnapChange?.();
          } else {
            // Still over the same container — keep the snap, don't update position
            return true;
          }
        }

        // Run proximity detection for container snapping
        const snap = findSnapContainer(worldX, worldY, planting, garden);
        if (snap) {
          if (snap.cursorInside && snap.empty) {
            // Cursor inside an empty container — snap immediately, no dwell
            clearDwell();
            putativeSnap.current = {
              containerId: snap.id,
              containerKind: snap.kind,
              slotX: snap.slotX,
              slotY: snap.slotY,
            };
            onSnapChange?.();
          } else if (dwellContainerId.current === snap.id) {
            // Timer already running for this container — keep going
          } else {
            // New container — reset timer
            clearDwell();
            dwellContainerId.current = snap.id;
            const capturedSnap = snap;
            dwellTimer.current = setTimeout(() => {
              putativeSnap.current = {
                containerId: capturedSnap.id,
                containerKind: capturedSnap.kind,
                slotX: capturedSnap.slotX,
                slotY: capturedSnap.slotY,
              };
              dwellTimer.current = null;
              onSnapChange?.();
            }, SNAP_DWELL_MS);
          }
        } else {
          // No container nearby — clear any pending dwell
          clearDwell();
        }

        // If snapped, don't update position (planting stays at snap slot visually)
        if (putativeSnap.current) return true;

        const parent = garden.structures.find((s) => s.id === planting.parentId)
          ?? garden.zones.find((z) => z.id === planting.parentId);
        if (parent) {
          // Check if cursor is back near where the drag started (snap-back)
          const orig = originalPlantingPos.current;
          if (orig) {
            const halfCell = cellSize / 2;
            const snapBackWorld = Math.max(halfCell, DRAG_THRESHOLD_PX / zoom);
            const wdx = worldX - moveStart.current.worldX;
            const wdy = worldY - moveStart.current.worldY;
            if (wdx * wdx + wdy * wdy < snapBackWorld * snapBackWorld) {
              // Snap back to original arrangement position
              const { updatePlanting } = useGardenStore.getState();
              updatePlanting(moveObjectId.current!, {
                x: orig.relX,
                y: orig.relY,
              });
              isAtOriginalPos.current = true;
              return true;
            }
          }
          isAtOriginalPos.current = false;

          // Convert world coords back to parent-relative
          const { updatePlanting } = useGardenStore.getState();
          updatePlanting(moveObjectId.current, {
            x: snappedX - parent.x,
            y: snappedY - parent.y,
          });
        }
      }
    }
    return true;
  }

  function end(e?: React.MouseEvent) {
    // If drag threshold was never exceeded, this was just a click — no-op
    if (isPending.current) {
      isPending.current = false;
      pendingClone.current = null;
      moveObjectId.current = null;
      moveObjectLayer.current = null;
      return;
    }

    // If planting was returned to its original position, undo the drag entirely
    if (moveObjectLayer.current === 'plantings' && isAtOriginalPos.current && !putativeSnap.current) {
      useGardenStore.getState().undo();
      clearSnap();
      isMoving.current = false;
      originalPlantingPos.current = null;
      isAtOriginalPos.current = false;
      moveObjectId.current = null;
      moveObjectLayer.current = null;
      childStartPositions.current.clear();
      return;
    }

    if (moveObjectLayer.current === 'plantings' && putativeSnap.current && moveObjectId.current) {
      const snap = putativeSnap.current;
      const { garden, updatePlanting, addPlanting } = useGardenStore.getState();
      const planting = garden.plantings.find((p) => p.id === moveObjectId.current);

      if (planting) {
        const altHeld = e?.altKey ?? false;
        if (altHeld && !isClone.current) {
          // Clone: leave original in place, create new planting in target container
          addPlanting({
            parentId: snap.containerId,
            x: snap.slotX,
            y: snap.slotY,
            cultivarId: planting.cultivarId,
          });
        } else {
          // Re-parent: move planting to the new container
          updatePlanting(moveObjectId.current, {
            parentId: snap.containerId,
            x: snap.slotX,
            y: snap.slotY,
          });
        }
      }
    }

    clearSnap();
    isMoving.current = false;
    isClone.current = false;
    pendingClone.current = null;
    originalPlantingPos.current = null;
    isAtOriginalPos.current = false;
    moveObjectId.current = null;
    moveObjectLayer.current = null;
    childStartPositions.current.clear();
  }

  return { start, move, end, isMoving, putativeSnap };
}
