import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

interface GridOptions {
  widthFt: number;
  heightFt: number;
  cellSizeFt: number;
  view: ViewTransform;
  canvasWidth: number;
  canvasHeight: number;
}

export function renderGrid(ctx: CanvasRenderingContext2D, opts: GridOptions): void {
  const { widthFt, heightFt, cellSizeFt, view, canvasWidth, canvasHeight } = opts;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Draw garden background
  const [originX, originY] = worldToScreen(0, 0, view);
  const gardenW = widthFt * view.zoom;
  const gardenH = heightFt * view.zoom;

  ctx.fillStyle = '#F5EDE0';
  ctx.fillRect(originX, originY, gardenW, gardenH);

  // Draw grid lines
  ctx.strokeStyle = '#D4C4A8';
  ctx.lineWidth = 1;

  // Vertical lines
  for (let x = 0; x <= widthFt; x += cellSizeFt) {
    const [sx, sy] = worldToScreen(x, 0, view);
    const [, ey] = worldToScreen(x, heightFt, view);
    ctx.beginPath();
    ctx.moveTo(Math.round(sx) + 0.5, Math.round(sy) + 0.5);
    ctx.lineTo(Math.round(sx) + 0.5, Math.round(ey) + 0.5);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = 0; y <= heightFt; y += cellSizeFt) {
    const [sx, sy] = worldToScreen(0, y, view);
    const [ex] = worldToScreen(widthFt, y, view);
    ctx.beginPath();
    ctx.moveTo(Math.round(sx) + 0.5, Math.round(sy) + 0.5);
    ctx.lineTo(Math.round(ex) + 0.5, Math.round(sy) + 0.5);
    ctx.stroke();
  }

  // Garden border
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 2;
  ctx.strokeRect(originX, originY, gardenW, gardenH);
}
