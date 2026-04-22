import { useRef } from 'react';
import { findSnapContainer } from '../findSnapContainer';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createPlanting } from '../../model/types';
import type { Planting, Structure } from '../../model/types';
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

  // Clone data replaces old pendingClone + isClone refs
  const cloneData = useRef<{
    parentId: string;
    x: number;
    y: number;
    cultivarId: string;
    parentWorldX: number;
    parentWorldY: number;
  } | null>(null);

  // Map of child ID -> {dx, dy} offset from primary object
  const childOffsets = useRef<Map<string, { dx: number; dy: number }>>(new Map());

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

  function cleanup() {
    clearSnap();
    isMoving.current = false;
    isPending.current = false;
    cloneData.current = null;
    moveObjectId.current = null;
    moveObjectLayer.current = null;
    childOffsets.current.clear();
  }

  function activateDrag() {
    isPending.current = false;
    isMoving.current = true;

    const { garden } = useGardenStore.getState();
    const layer = moveObjectLayer.current;

    if (cloneData.current) {
      // Clone: create a transient planting for the overlay (not added to garden)
      const clone = cloneData.current;
      const transient = createPlanting({
        parentId: clone.parentId,
        x: clone.x,
        y: clone.y,
        cultivarId: clone.cultivarId,
      });
      moveObjectId.current = transient.id;
      // Set objX/objY to world coords for the clone
      moveStart.current.objX = clone.parentWorldX + clone.x;
      moveStart.current.objY = clone.parentWorldY + clone.y;

      useUiStore.getState().setDragOverlay({
        layer: 'plantings',
        objects: [transient],
        hideIds: [], // clone: original stays visible
        snapped: false,
      });
      useUiStore.getState().select(transient.id);
      cloneData.current = null;
    } else if (layer === 'structures') {
      const primary = garden.structures.find(s => s.id === moveObjectId.current);
      if (!primary) return;

      const children = garden.structures.filter(s => s.parentId === primary.id);
      // Store child offsets relative to primary
      childOffsets.current.clear();
      for (const child of children) {
        childOffsets.current.set(child.id, {
          dx: child.x - primary.x,
          dy: child.y - primary.y,
        });
      }

      const allObjects = [{ ...primary }, ...children.map(c => ({ ...c }))];
      const allIds = allObjects.map(o => o.id);

      useUiStore.getState().setDragOverlay({
        layer: 'structures',
        objects: allObjects,
        hideIds: allIds,
        snapped: false,
      });
    } else if (layer === 'zones') {
      const zone = garden.zones.find(z => z.id === moveObjectId.current);
      if (!zone) return;

      useUiStore.getState().setDragOverlay({
        layer: 'zones',
        objects: [{ ...zone }],
        hideIds: [zone.id],
        snapped: false,
      });
    } else if (layer === 'plantings') {
      const planting = garden.plantings.find(p => p.id === moveObjectId.current);
      if (!planting) return;

      // Convert planting position to world coords for overlay
      const parent = garden.structures.find(s => s.id === planting.parentId)
        ?? garden.zones.find(z => z.id === planting.parentId);
      const worldPlanting: Planting = {
        ...planting,
        x: parent ? parent.x + planting.x : planting.x,
        y: parent ? parent.y + planting.y : planting.y,
      };

      useUiStore.getState().setDragOverlay({
        layer: 'plantings',
        objects: [worldPlanting],
        hideIds: [planting.id],
        snapped: false,
      });
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
    cloneInfo?: { parentId: string; x: number; y: number; cultivarId: string; parentWorldX: number; parentWorldY: number },
  ) {
    isPending.current = true;
    isMoving.current = false;
    moveStart.current = { worldX, worldY, objX, objY };
    moveObjectId.current = objId;
    moveObjectLayer.current = layer;
    forceSnap.current = alwaysSnap;
    cloneData.current = cloneInfo ?? null;
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
    const { garden } = useGardenStore.getState();
    const cellSize = garden.gridCellSizeFt;
    const freeMove = e.altKey && !forceSnap.current;
    const snappedX = freeMove ? newX : snapToGrid(newX, cellSize);
    const snappedY = freeMove ? newY : snapToGrid(newY, cellSize);

    const overlay = useUiStore.getState().dragOverlay;
    if (!overlay) return true;

    if (moveObjectLayer.current === 'structures') {
      const primary = overlay.objects.find(o => o.id === moveObjectId.current) as Structure | undefined;
      if (primary) {
        const moved = { ...primary, x: snappedX, y: snappedY };
        // Collision check against garden structures not in the overlay
        const others = garden.structures.filter(s => !overlay.hideIds.includes(s.id));
        if (!structuresCollide(moved, others)) {
          const updatedObjects = overlay.objects.map(obj => {
            if (obj.id === moveObjectId.current) {
              return { ...obj, x: snappedX, y: snappedY };
            }
            const offset = childOffsets.current.get(obj.id);
            if (offset) {
              return { ...obj, x: snappedX + offset.dx, y: snappedY + offset.dy };
            }
            return obj;
          });
          useUiStore.getState().setDragOverlay({ ...overlay, objects: updatedObjects });
        }
      }
    } else if (moveObjectLayer.current === 'zones') {
      const updatedObjects = overlay.objects.map(obj => {
        if (obj.id === moveObjectId.current) {
          return { ...obj, x: snappedX, y: snappedY };
        }
        return obj;
      });
      useUiStore.getState().setDragOverlay({ ...overlay, objects: updatedObjects });
    } else if (moveObjectLayer.current === 'plantings') {
      const planting = overlay.objects.find(o => o.id === moveObjectId.current) as Planting | undefined;
      if (planting) {
        // Create a fake planting with parent-relative coords for findSnapContainer
        // The overlay planting has world coords, so we need to create something compatible
        const fakePlanting: Planting = {
          ...planting,
          // findSnapContainer uses parent.x + planting.x to compute world pos
          // and checks if it's inside parent. For a planting being dragged freely,
          // set parentId to empty so it won't match any parent exclusion.
          parentId: overlay.hideIds.length > 0 ? overlay.hideIds[0] : '',
        };
        // For the parent-relative check in findSnapContainer, we need to find
        // the original parent and compute relative coords
        const origParent = garden.structures.find(s => s.id === fakePlanting.parentId)
          ?? garden.zones.find(z => z.id === fakePlanting.parentId);
        if (origParent) {
          fakePlanting.x = snappedX - origParent.x;
          fakePlanting.y = snappedY - origParent.y;
        } else {
          fakePlanting.x = snappedX;
          fakePlanting.y = snappedY;
        }

        // If we have an active putative snap, check whether cursor moved away
        if (putativeSnap.current) {
          const snap = findSnapContainer(worldX, worldY, fakePlanting, garden);
          if (!snap || snap.id !== putativeSnap.current.containerId) {
            // Moved away from snapped container — cancel and resume cursor-following
            clearSnap();
            useUiStore.getState().setDragOverlay({ ...overlay, snapped: false });
            onSnapChange?.();
          } else {
            // Still over the same container — keep the snap, don't update position
            return true;
          }
        }

        // Run proximity detection for container snapping
        const snap = findSnapContainer(worldX, worldY, fakePlanting, garden);
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
            // Update overlay to show snapped position (convert slot to world coords)
            const snapParent = garden.structures.find(s => s.id === snap.id)
              ?? garden.zones.find(z => z.id === snap.id);
            if (snapParent) {
              const updatedObjects = overlay.objects.map(obj =>
                obj.id === moveObjectId.current
                  ? { ...obj, x: snapParent.x + snap.slotX, y: snapParent.y + snap.slotY }
                  : obj,
              );
              useUiStore.getState().setDragOverlay({ ...overlay, objects: updatedObjects, snapped: true });
            }
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
              // Update overlay to show snapped position
              const currentOverlay = useUiStore.getState().dragOverlay;
              if (currentOverlay) {
                const snapContainer = garden.structures.find(s => s.id === capturedSnap.id)
                  ?? garden.zones.find(z => z.id === capturedSnap.id);
                if (snapContainer) {
                  const updatedObjects = currentOverlay.objects.map(obj =>
                    obj.id === moveObjectId.current
                      ? { ...obj, x: snapContainer.x + capturedSnap.slotX, y: snapContainer.y + capturedSnap.slotY }
                      : obj,
                  );
                  useUiStore.getState().setDragOverlay({ ...currentOverlay, objects: updatedObjects, snapped: true });
                }
              }
              onSnapChange?.();
            }, SNAP_DWELL_MS);
          }
        } else {
          // No container nearby — clear any pending dwell
          clearDwell();
        }

        // If snapped, don't update position (planting stays at snap slot visually)
        if (putativeSnap.current) return true;

        // Update overlay with world coords (free drag)
        const updatedObjects = overlay.objects.map(obj =>
          obj.id === moveObjectId.current
            ? { ...obj, x: snappedX, y: snappedY }
            : obj,
        );
        useUiStore.getState().setDragOverlay({ ...overlay, objects: updatedObjects, snapped: false });
      }
    }
    return true;
  }

  function end(_e?: React.MouseEvent) {
    // If drag threshold was never exceeded, this was just a click — no-op
    if (isPending.current) {
      cleanup();
      return;
    }

    const overlay = useUiStore.getState().dragOverlay;
    if (!overlay) {
      cleanup();
      return;
    }

    const { garden, checkpoint, updateStructure, updateZone, updatePlanting, addPlanting } =
      useGardenStore.getState();

    // If this is a move (not a clone/palette drop), check if position actually changed
    if (overlay.hideIds.length > 0) {
      if (overlay.layer === 'structures') {
        const original = garden.structures.find(s => s.id === overlay.hideIds[0]);
        const moved = overlay.objects[0] as Structure;
        if (original && original.x === moved.x && original.y === moved.y) {
          cancel();
          return;
        }
      } else if (overlay.layer === 'zones') {
        const original = garden.zones.find(z => z.id === overlay.hideIds[0]);
        const moved = overlay.objects[0];
        if (original && original.x === moved.x && original.y === moved.y) {
          cancel();
          return;
        }
      } else if (overlay.layer === 'plantings') {
        const original = garden.plantings.find(p => p.id === overlay.hideIds[0]);
        if (original) {
          if (putativeSnap.current) {
            // Snapped: compare target container/slot with original
            const snap = putativeSnap.current;
            if (snap.containerId === original.parentId && snap.slotX === original.x && snap.slotY === original.y) {
              cancel();
              return;
            }
          } else {
            // Free drag: compare world coords back to parent-relative
            const moved = overlay.objects[0] as Planting;
            const parent = garden.structures.find(s => s.id === original.parentId)
              ?? garden.zones.find(z => z.id === original.parentId);
            if (parent) {
              const finalRelX = moved.x - parent.x;
              const finalRelY = moved.y - parent.y;
              if (original.x === finalRelX && original.y === finalRelY) {
                cancel();
                return;
              }
            }
          }
        }
      }
    }

    // Push pre-drag state to history (one undo entry)
    checkpoint();

    if (moveObjectLayer.current === 'structures') {
      for (const obj of overlay.objects) {
        updateStructure(obj.id, { x: obj.x, y: obj.y });
      }
    } else if (moveObjectLayer.current === 'zones') {
      for (const obj of overlay.objects) {
        updateZone(obj.id, { x: obj.x, y: obj.y });
      }
    } else if (moveObjectLayer.current === 'plantings') {
      const overlayPlanting = overlay.objects[0] as Planting;

      if (putativeSnap.current) {
        const snap = putativeSnap.current;
        if (overlay.hideIds.length > 0) {
          // Move: re-parent planting to snap container
          updatePlanting(overlay.hideIds[0], {
            parentId: snap.containerId,
            x: snap.slotX,
            y: snap.slotY,
          });
        } else {
          // Clone/palette: add new planting in target container
          addPlanting({
            parentId: snap.containerId,
            x: snap.slotX,
            y: snap.slotY,
            cultivarId: overlayPlanting.cultivarId,
          });
        }
      } else {
        // Free drag — convert world coords back to parent-relative
        if (overlay.hideIds.length > 0) {
          // Move: find parent and compute relative coords
          const plantingId = overlay.hideIds[0];
          const origPlanting = garden.plantings.find(p => p.id === plantingId);
          const parentId = origPlanting?.parentId ?? '';
          const parent = garden.structures.find(s => s.id === parentId)
            ?? garden.zones.find(z => z.id === parentId);
          if (parent) {
            updatePlanting(plantingId, {
              x: overlayPlanting.x - parent.x,
              y: overlayPlanting.y - parent.y,
            });
          }
        } else {
          // Clone: find container under world coords and add planting
          // For now, find any container that contains the point
          const containers = [
            ...garden.structures.filter(s => s.container),
            ...garden.zones,
          ];
          for (const c of containers) {
            if (
              overlayPlanting.x >= c.x && overlayPlanting.x <= c.x + c.width &&
              overlayPlanting.y >= c.y && overlayPlanting.y <= c.y + c.height
            ) {
              addPlanting({
                parentId: c.id,
                x: overlayPlanting.x - c.x,
                y: overlayPlanting.y - c.y,
                cultivarId: overlayPlanting.cultivarId,
              });
              break;
            }
          }
        }
      }
    }

    useUiStore.getState().clearDragOverlay();
    cleanup();
  }

  function cancel() {
    useUiStore.getState().clearDragOverlay();
    cleanup();
  }

  return { start, move, end, cancel, isMoving, putativeSnap };
}
