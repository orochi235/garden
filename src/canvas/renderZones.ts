import type { Zone } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

export function renderZones(
  ctx: CanvasRenderingContext2D,
  zones: Zone[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number,
  highlight: boolean = false,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (zones.length === 0) return;

  ctx.globalAlpha = opacity;

  const sorted = [...zones].sort((a, b) => a.zIndex - b.zIndex);

  for (const z of sorted) {
    const [sx, sy] = worldToScreen(z.x, z.y, view);
    const sw = z.width * view.zoom;
    const sh = z.height * view.zoom;

    ctx.fillStyle = z.color;
    ctx.fillRect(sx, sy, sw, sh);

    ctx.strokeStyle = '#4A7C59';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.setLineDash([]);

    if (highlight) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(sx, sy, sw, sh);
    }

    if (z.label) {
      ctx.fillStyle = '#2D4F3A';
      ctx.font = `${Math.max(10, 12 * view.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(z.label, sx + sw / 2, sy + sh / 2);
    }
  }

  ctx.globalAlpha = 1;
}
