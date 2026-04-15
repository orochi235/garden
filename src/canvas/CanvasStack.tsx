import { useRef, useEffect } from 'react';
import { useCanvasSize } from './useCanvasSize';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { renderGrid } from './renderGrid';

export function CanvasStack() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, dpr } = useCanvasSize(containerRef);

  const garden = useGardenStore((s) => s.garden);
  const zoom = useUiStore((s) => s.zoom);
  const panX = useUiStore((s) => s.panX);
  const panY = useUiStore((s) => s.panY);

  // Render grid layer
  useEffect(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas || width === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    renderGrid(ctx, {
      widthFt: garden.widthFt,
      heightFt: garden.heightFt,
      cellSizeFt: garden.gridCellSizeFt,
      view: { panX, panY, zoom },
      canvasWidth: width,
      canvasHeight: height,
    });
  }, [garden.widthFt, garden.heightFt, garden.gridCellSizeFt, zoom, panX, panY, width, height, dpr]);

  const canvasStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: `${width}px`,
    height: `${height}px`,
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#E8E0D0' }}>
      <canvas ref={gridCanvasRef} style={canvasStyle} />
    </div>
  );
}
