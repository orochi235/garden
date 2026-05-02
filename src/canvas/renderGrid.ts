/**
 * Garden-side grid renderer. Inlined from weasel's pre-3b01da9 `renderGrid`
 * (which baked in garden-specific concepts: `widthFt`/`heightFt` plot
 * rectangle, screen-space pixel snapping). Kept here verbatim so the
 * extracted kit stays domain-agnostic. For a layered, world-space grid
 * primitive see `createGridLayer` from `@orochi235/weasel`.
 */

import type { ViewTransform } from '@orochi235/weasel';
import { worldToScreen } from '@orochi235/weasel';

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

  const worldLeft = -view.panX / view.zoom;
  const worldTop = -view.panY / view.zoom;
  const worldRight = (canvasWidth - view.panX) / view.zoom;
  const worldBottom = (canvasHeight - view.panY) / view.zoom;

  const startX = Math.floor(worldLeft / cellSizeFt) * cellSizeFt;
  const endX = Math.ceil(worldRight / cellSizeFt) * cellSizeFt;
  const startY = Math.floor(worldTop / cellSizeFt) * cellSizeFt;
  const endY = Math.ceil(worldBottom / cellSizeFt) * cellSizeFt;

  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;

  for (let x = startX; x <= endX; x += cellSizeFt) {
    const sx = Math.round(view.panX + x * view.zoom) + 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, canvasHeight);
    ctx.stroke();
  }

  for (let y = startY; y <= endY; y += cellSizeFt) {
    const sy = Math.round(view.panY + y * view.zoom) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(canvasWidth, sy);
    ctx.stroke();
  }

  const [originX, originY] = worldToScreen(0, 0, view);
  const gardenW = widthFt * view.zoom;
  const gardenH = heightFt * view.zoom;

  ctx.fillStyle = 'rgba(245, 237, 224, 0.5)';
  ctx.fillRect(originX, originY, gardenW, gardenH);

  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 2;
  ctx.strokeRect(originX, originY, gardenW, gardenH);
}
