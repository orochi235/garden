import { useRef } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { screenToWorld } from '@/canvas-kit';
import { hitTestArea } from '../hitTest';

interface AreaSelectDeps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectionCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  width: number;
  height: number;
  dpr: number;
}

export function useAreaSelectInteraction({
  containerRef,
  selectionCanvasRef,
  width,
  height,
  dpr,
}: AreaSelectDeps) {
  const isDragging = useRef(false);
  const startPoint = useRef({ worldX: 0, worldY: 0 });
  const currentPoint = useRef({ worldX: 0, worldY: 0 });
  const shiftHeld = useRef(false);

  function start(worldX: number, worldY: number, shiftKey: boolean) {
    isDragging.current = true;
    startPoint.current = { worldX, worldY };
    currentPoint.current = { worldX, worldY };
    shiftHeld.current = shiftKey;
  }

  function move(e: React.MouseEvent): boolean {
    if (!isDragging.current) return false;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const { panX, panY, zoom } = useUiStore.getState();
    const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, {
      panX,
      panY,
      zoom,
    });
    currentPoint.current = { worldX, worldY };

    // Draw marquee on the selection canvas
    const canvas = selectionCanvasRef.current;
    if (canvas && width > 0) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);

      const view = { panX, panY, zoom };
      const x = Math.min(startPoint.current.worldX, currentPoint.current.worldX);
      const y = Math.min(startPoint.current.worldY, currentPoint.current.worldY);
      const w = Math.abs(currentPoint.current.worldX - startPoint.current.worldX);
      const h = Math.abs(currentPoint.current.worldY - startPoint.current.worldY);

      const sx = view.panX + x * view.zoom;
      const sy = view.panY + y * view.zoom;
      const sw = w * view.zoom;
      const sh = h * view.zoom;

      ctx.fillStyle = 'rgba(91, 164, 207, 0.15)';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = '#5BA4CF';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sx, sy, sw, sh);
    }
    return true;
  }

  function end() {
    if (!isDragging.current) return;
    isDragging.current = false;

    const x = Math.min(startPoint.current.worldX, currentPoint.current.worldX);
    const y = Math.min(startPoint.current.worldY, currentPoint.current.worldY);
    const w = Math.abs(currentPoint.current.worldX - startPoint.current.worldX);
    const h = Math.abs(currentPoint.current.worldY - startPoint.current.worldY);

    if (w > 0 && h > 0) {
      const { garden } = useGardenStore.getState();
      const hits = hitTestArea(
        { x, y, width: w, height: h },
        garden.structures,
        garden.zones,
        garden.plantings,
      );
      const hitIds = hits.map((h) => h.id);

      if (shiftHeld.current) {
        // Add to existing selection
        const { selectedIds } = useUiStore.getState();
        const merged = [...selectedIds];
        for (const id of hitIds) {
          if (!merged.includes(id)) merged.push(id);
        }
        useUiStore.getState().setSelection(merged);
      } else {
        useUiStore.getState().setSelection(hitIds);
      }
    } else if (!shiftHeld.current) {
      useUiStore.getState().clearSelection();
    }

    // Clear marquee
    const canvas = selectionCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function cancel() {
    isDragging.current = false;
    const canvas = selectionCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  return { start, move, end, cancel, isDragging };
}
