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
  highlight: boolean = false,
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
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;

    if (s.shape === 'circle') {
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
    }

    if (highlight) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      if (s.shape === 'circle') {
        const cx = sx + sw / 2;
        const cy = sy + sh / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(sx, sy, sw, sh);
      }
    }

  }

  ctx.globalAlpha = 1;
}
