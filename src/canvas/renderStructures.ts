import type { Structure } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

export function renderStructures(
  ctx: CanvasRenderingContext2D,
  structures: Structure[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (structures.length === 0) return;

  ctx.globalAlpha = opacity;

  const sorted = [...structures].sort((a, b) => a.zIndex - b.zIndex);

  for (const s of sorted) {
    const [sx, sy] = worldToScreen(s.x, s.y, view);
    const sw = s.width * view.zoom;
    const sh = s.height * view.zoom;

    ctx.fillStyle = s.color;
    ctx.fillRect(sx, sy, sw, sh);

    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, sy, sw, sh);

    if (s.label) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `${Math.max(10, 12 * view.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, sx + sw / 2, sy + sh / 2);
    }
  }

  ctx.globalAlpha = 1;
}
