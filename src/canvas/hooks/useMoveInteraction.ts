import { useRef } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { screenToWorld, snapToGrid } from '../../utils/grid';
import { structuresCollide } from '../../utils/collision';

export function useMoveInteraction(containerRef: React.RefObject<HTMLDivElement | null>) {
  const isMoving = useRef(false);
  const moveStart = useRef({ worldX: 0, worldY: 0, objX: 0, objY: 0 });
  const moveObjectId = useRef<string | null>(null);
  const moveObjectLayer = useRef<string | null>(null);
  const forceSnap = useRef(false);
  const childStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  function start(
    worldX: number,
    worldY: number,
    objId: string,
    layer: string,
    objX: number,
    objY: number,
    alwaysSnap = false,
  ) {
    useGardenStore.getState().checkpoint();
    isMoving.current = true;
    moveStart.current = { worldX, worldY, objX, objY };
    moveObjectId.current = objId;
    moveObjectLayer.current = layer;
    forceSnap.current = alwaysSnap;

    // Capture initial positions of child structures so they move with the parent
    childStartPositions.current.clear();
    if (layer === 'structures') {
      for (const s of useGardenStore.getState().garden.structures) {
        if (s.parentId === objId) {
          childStartPositions.current.set(s.id, { x: s.x, y: s.y });
        }
      }
    }
  }

  function move(e: React.MouseEvent) {
    if (!isMoving.current || !moveObjectId.current) return false;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;
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
        const parent = garden.structures.find((s) => s.id === planting.parentId)
          ?? garden.zones.find((z) => z.id === planting.parentId);
        if (parent) {
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

  function end() {
    isMoving.current = false;
    moveObjectId.current = null;
    moveObjectLayer.current = null;
    childStartPositions.current.clear();
  }

  return { start, move, end, isMoving };
}
