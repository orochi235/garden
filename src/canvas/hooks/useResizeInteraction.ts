import { useRef } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { screenToWorld, snapToGrid } from '../../utils/grid';
import type { HandlePosition } from '../hitTest';

export function useResizeInteraction(containerRef: React.RefObject<HTMLDivElement | null>) {
  const isResizing = useRef(false);
  const resizeHandle = useRef<HandlePosition | null>(null);
  const resizeObjectId = useRef<string | null>(null);
  const resizeObjectLayer = useRef<string | null>(null);
  const resizeOriginal = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const resizeStartWorld = useRef({ worldX: 0, worldY: 0 });
  const resizeTarget = useRef({ x: 0, y: 0, width: 0, height: 0 });

  function start(
    handle: HandlePosition,
    objId: string,
    layer: string,
    obj: { x: number; y: number; width: number; height: number },
    worldX: number,
    worldY: number,
  ) {
    useGardenStore.getState().checkpoint();
    isResizing.current = true;
    resizeHandle.current = handle;
    resizeObjectId.current = objId;
    resizeObjectLayer.current = layer;
    resizeOriginal.current = { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
    resizeStartWorld.current = { worldX, worldY };
  }

  function move(e: React.MouseEvent) {
    if (!isResizing.current || !resizeObjectId.current || !resizeHandle.current) return false;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const { panX, panY, zoom } = useUiStore.getState();
    const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, { panX, panY, zoom });
    const { garden, updateStructure, updateZone } = useGardenStore.getState();
    const cellSize = garden.gridCellSizeFt;
    const snap = (v: number) => e.altKey ? v : snapToGrid(v, cellSize);

    const orig = resizeOriginal.current;
    const handle = resizeHandle.current;

    // Compute snapped target bounds
    let tx = orig.x, ty = orig.y, tw = orig.width, th = orig.height;
    if (handle.includes('e')) tw = snap(worldX) - tx;
    if (handle.includes('w')) { const nx = snap(worldX); tw = orig.x + orig.width - nx; tx = nx; }
    if (handle.includes('s')) th = snap(worldY) - ty;
    if (handle.includes('n')) { const ny = snap(worldY); th = orig.y + orig.height - ny; ty = ny; }

    // Enforce minimum size
    const minSize = cellSize > 0 ? cellSize : 0.5;
    if (tw < minSize) { if (handle.includes('w')) tx = orig.x + orig.width - minSize; tw = minSize; }
    if (th < minSize) { if (handle.includes('n')) ty = orig.y + orig.height - minSize; th = minSize; }

    // Lerp current position toward snap target for smooth animation
    const obj = resizeObjectLayer.current === 'structures'
      ? garden.structures.find((s) => s.id === resizeObjectId.current)
      : garden.zones.find((z) => z.id === resizeObjectId.current);
    const LERP = 0.35;
    const lerp = (a: number, b: number) => a + (b - a) * LERP;
    const x = obj ? lerp(obj.x, tx) : tx;
    const y = obj ? lerp(obj.y, ty) : ty;
    const width = obj ? lerp(obj.width, tw) : tw;
    const height = obj ? lerp(obj.height, th) : th;

    resizeTarget.current = { x: tx, y: ty, width: tw, height: th };

    if (resizeObjectLayer.current === 'structures') {
      updateStructure(resizeObjectId.current, { x, y, width, height });
    } else if (resizeObjectLayer.current === 'zones') {
      updateZone(resizeObjectId.current, { x, y, width, height });
    }
    return true;
  }

  function end() {
    // Snap to exact grid on resize end
    if (isResizing.current && resizeObjectId.current) {
      const t = resizeTarget.current;
      const { updateStructure, updateZone } = useGardenStore.getState();
      if (resizeObjectLayer.current === 'structures') {
        updateStructure(resizeObjectId.current, { x: t.x, y: t.y, width: t.width, height: t.height });
      } else if (resizeObjectLayer.current === 'zones') {
        updateZone(resizeObjectId.current, { x: t.x, y: t.y, width: t.width, height: t.height });
      }
    }
    isResizing.current = false;
    resizeHandle.current = null;
    resizeObjectId.current = null;
    resizeObjectLayer.current = null;
  }

  return { start, move, end, isResizing };
}
