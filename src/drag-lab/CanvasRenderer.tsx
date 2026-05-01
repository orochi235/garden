import { useRef, useEffect, useCallback, useState } from 'react';
import type { LabItem, Point, Rect, ContainerShape, LayoutStrategy, DragFeedback } from './types';
import { PX_PER_FT, DISPLAY_PX_PER_FT } from './constants';
import { useDropZone } from '@orochi235/weasel';

interface CanvasRendererProps {
  width: number;
  height: number;
  shape: ContainerShape;
  items: LabItem[];
  strategy: LayoutStrategy;
  config: Record<string, unknown>;
  onDrop: (pos: Point, item: LabItem) => void;
  onPickUpItem: (itemId: string) => LabItem | undefined;
}

function hitTestItem(items: LabItem[], pos: Point): LabItem | null {
  let nearest: LabItem | null = null;
  let nearestDist = Infinity;
  for (const item of items) {
    const d = Math.sqrt((item.x - pos.x) ** 2 + (item.y - pos.y) ** 2);
    if (d < item.radiusFt + 0.05 && d < nearestDist) {
      nearest = item;
      nearestDist = d;
    }
  }
  return nearest;
}

export function CanvasRenderer({ width, height, shape, items, strategy, config, onDrop, onPickUpItem }: CanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [feedback, setFeedback] = useState<DragFeedback | null>(null);

  const pointerDrag = useRef<{ item: LabItem } | null>(null);
  const [paletteDragItem, setPaletteDragItem] = useState<LabItem | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  const bounds: Rect = { x: 0, y: 0, width, height };
  const canvasW = width * PX_PER_FT;
  const canvasH = height * PX_PER_FT;

  const pxToFt = useCallback(
    (clientX: number, clientY: number): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * width,
        y: ((clientY - rect.top) / rect.height) * height,
      };
    },
    [width, height],
  );

  // --- Pointer-based drag (canvas items) ---

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return;
      const pos = pxToFt(e.clientX, e.clientY);
      const hit = hitTestItem(items, pos);
      if (!hit) return;

      const picked = onPickUpItem(hit.id);
      if (!picked) return;

      pointerDrag.current = { item: picked };
      setHoveredItemId(null);
      setMousePos(pos);
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [pxToFt, items, onPickUpItem],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const pos = pxToFt(e.clientX, e.clientY);
      if (pointerDrag.current) {
        setMousePos(pos);
        const item = pointerDrag.current.item;
        setFeedback(strategy.onDragOver(bounds, shape, pos, items, { ...config, _dragRadius: item.radiusFt }));
      } else {
        const hit = hitTestItem(items, pos);
        setHoveredItemId(hit?.id ?? null);
      }
    },
    [pxToFt, strategy, bounds, shape, items, config],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointerDrag.current) return;
      const pos = pxToFt(e.clientX, e.clientY);
      onDrop(pos, pointerDrag.current.item);
      pointerDrag.current = null;
      setFeedback(null);
      setMousePos(null);
    },
    [pxToFt, onDrop],
  );

  const dropRef = useDropZone<HTMLCanvasElement>({
    accepts: (kind) => kind === 'lab-item',
    onOver: (active) => {
      if (!active) {
        setPaletteDragItem(null);
        setFeedback(null);
        setMousePos(null);
      }
    },
    onMove: (payload, x, y) => {
      const item = payload.data as LabItem;
      setPaletteDragItem(item);
      const pos = pxToFt(x, y);
      setMousePos(pos);
      setFeedback(strategy.onDragOver(bounds, shape, pos, items, { ...config, _dragRadius: item.radiusFt }));
    },
    onDrop: (payload, x, y) => {
      const item = payload.data as LabItem;
      const pos = pxToFt(x, y);
      onDrop(pos, item);
      setPaletteDragItem(null);
      setFeedback(null);
      setMousePos(null);
    },
  });

  const setRefs = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    dropRef(el);
  }, [dropRef]);

  const handlePointerLeave = useCallback(() => {
    if (!pointerDrag.current) {
      setHoveredItemId(null);
    }
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const pos = pxToFt(e.clientX, e.clientY);
      const hit = hitTestItem(items, pos);
      if (hit) onPickUpItem(hit.id);
    },
    [pxToFt, items, onPickUpItem],
  );

  const activeDragItem = pointerDrag.current?.item ?? paletteDragItem;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvasW, canvasH);

    ctx.save();
    ctx.scale(PX_PER_FT, PX_PER_FT);

    ctx.fillStyle = '#2a2018';
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4a3c2e';
      ctx.lineWidth = 0.03;
      ctx.stroke();
    } else {
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#4a3c2e';
      ctx.lineWidth = 0.03;
      ctx.strokeRect(0, 0, width, height);
    }

    strategy.render(ctx, bounds, shape, items, config);

    if (hoveredItemId) {
      const hovered = items.find((i) => i.id === hoveredItemId);
      if (hovered) {
        ctx.beginPath();
        ctx.arc(hovered.x, hovered.y, hovered.radiusFt + 0.04, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 0.04;
        ctx.stroke();
      }
    }

    const hideTarget = feedback?.hide ?? 'ghost';

    if (feedback) {
      feedback.render(ctx, bounds);
    }

    if (activeDragItem && mousePos && !(feedback && hideTarget === 'ghost')) {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, activeDragItem.radiusFt, 0, Math.PI * 2);
      ctx.fillStyle = activeDragItem.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, [canvasW, canvasH, width, height, shape, items, strategy, config, feedback, activeDragItem, mousePos, bounds, hoveredItemId]);

  const cursor = pointerDrag.current ? 'grabbing' : hoveredItemId ? 'grab' : 'default';

  return (
    <canvas
      ref={setRefs}
      width={canvasW}
      height={canvasH}
      style={{ width: width * DISPLAY_PX_PER_FT, height: height * DISPLAY_PX_PER_FT, cursor, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onContextMenu={handleContextMenu}
    />
  );
}
