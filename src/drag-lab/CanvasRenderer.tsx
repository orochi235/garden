import { useRef, useEffect, useCallback, useState } from 'react';
import type { LabItem, Point, Rect, ContainerShape, LayoutStrategy, DragFeedback } from './types';

const PX_PER_FT = 80;

interface CanvasRendererProps {
  width: number;
  height: number;
  shape: ContainerShape;
  items: LabItem[];
  strategy: LayoutStrategy;
  config: Record<string, unknown>;
  onDrop: (pos: Point, item: LabItem) => void;
  onPickUpItem: (itemId: string) => LabItem | undefined;
  dragItem: LabItem | null;
  onDragStart: (item: LabItem) => void;
  onDragEnd: () => void;
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

export function CanvasRenderer({ width, height, shape, items, strategy, config, onDrop, onPickUpItem, dragItem, onDragStart, onDragEnd }: CanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [feedback, setFeedback] = useState<DragFeedback | null>(null);

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

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLCanvasElement>) => {
      const pos = pxToFt(e.clientX, e.clientY);
      const hit = hitTestItem(items, pos);
      if (hit) {
        const picked = onPickUpItem(hit.id);
        if (picked) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', '');
          onDragStart(picked);
          return;
        }
      }
      // No item under cursor — cancel the drag
      e.preventDefault();
    },
    [pxToFt, items, onPickUpItem, onDragStart],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = dragItem ? 'copy' : 'none';
      const pos = pxToFt(e.clientX, e.clientY);
      setMousePos(pos);
      if (dragItem) {
        setFeedback(strategy.onDragOver(bounds, shape, pos, items, config));
      }
    },
    [pxToFt, dragItem, strategy, bounds, shape, items, config],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!dragItem) return;
      const pos = pxToFt(e.clientX, e.clientY);
      onDrop(pos, dragItem);
      setFeedback(null);
      setMousePos(null);
      onDragEnd();
    },
    [pxToFt, dragItem, onDrop, onDragEnd],
  );

  const handleDragLeave = useCallback(() => {
    setFeedback(null);
    setMousePos(null);
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

    if (feedback) {
      feedback.render(ctx, bounds);
    }

    if (dragItem && mousePos) {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, dragItem.radiusFt, 0, Math.PI * 2);
      ctx.fillStyle = dragItem.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, [canvasW, canvasH, width, height, shape, items, strategy, config, feedback, dragItem, mousePos, bounds]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={canvasH}
      style={{ width: canvasW, height: canvasH, cursor: 'default' }}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      onContextMenu={handleContextMenu}
    />
  );
}
