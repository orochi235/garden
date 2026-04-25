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
  onRemoveItem: (itemId: string) => void;
  dragItem: LabItem | null;
}

export function CanvasRenderer({ width, height, shape, items, strategy, config, onDrop, onRemoveItem, dragItem }: CanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [feedback, setFeedback] = useState<DragFeedback | null>(null);

  const bounds: Rect = { x: 0, y: 0, width, height };
  const canvasW = width * PX_PER_FT;
  const canvasH = height * PX_PER_FT;

  const pxToFt = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * width,
        y: ((e.clientY - rect.top) / rect.height) * height,
      };
    },
    [width, height],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = pxToFt(e);
      setMousePos(pos);
      if (dragItem) {
        setFeedback(strategy.onDragOver(bounds, shape, pos, items, config));
      }
    },
    [pxToFt, dragItem, strategy, bounds, shape, items, config],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dragItem) return;
      const pos = pxToFt(e);
      onDrop(pos, dragItem);
      setFeedback(null);
    },
    [pxToFt, dragItem, onDrop],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const pos = pxToFt(e);
      let nearest: LabItem | null = null;
      let nearestDist = Infinity;
      for (const item of items) {
        const d = Math.sqrt((item.x - pos.x) ** 2 + (item.y - pos.y) ** 2);
        if (d < item.radiusFt + 0.1 && d < nearestDist) {
          nearest = item;
          nearestDist = d;
        }
      }
      if (nearest) onRemoveItem(nearest.id);
    },
    [pxToFt, items, onRemoveItem],
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
      style={{ width: canvasW, height: canvasH, cursor: dragItem ? 'crosshair' : 'default' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
    />
  );
}
