import { useRef } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { screenToWorld, snapToGrid } from '../../utils/grid';

export function useMoveInteraction(containerRef: React.RefObject<HTMLDivElement | null>) {
  const isMoving = useRef(false);
  const moveStart = useRef({ worldX: 0, worldY: 0, objX: 0, objY: 0 });
  const moveObjectId = useRef<string | null>(null);
  const moveObjectLayer = useRef<string | null>(null);
  const forceSnap = useRef(false);

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
      updateStructure(moveObjectId.current, { x: snappedX, y: snappedY });
    } else if (moveObjectLayer.current === 'zones') {
      updateZone(moveObjectId.current, { x: snappedX, y: snappedY });
    }
    return true;
  }

  function end() {
    isMoving.current = false;
    moveObjectId.current = null;
    moveObjectLayer.current = null;
  }

  return { start, move, end, isMoving };
}
