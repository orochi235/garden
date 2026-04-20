import { FILL_COLORS } from '../model/types';
import type { Structure } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

let hatchPattern: CanvasPattern | null = null;

function getHatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (hatchPattern) return hatchPattern;
  const size = 5;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const oc = off.getContext('2d')!;
  oc.strokeStyle = 'goldenrod';
  oc.lineWidth = 1;
  oc.beginPath();
  oc.moveTo(0, size);
  oc.lineTo(size, 0);
  oc.stroke();
  hatchPattern = ctx.createPattern(off, 'repeat');
  return hatchPattern;
}

export function renderStructures(
  ctx: CanvasRenderingContext2D,
  structures: Structure[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number,
  highlight: boolean = false,
  showSurfaces: boolean = false,
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

    if (s.type === 'pot' || s.type === 'felt-planter') {
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      const r = Math.min(sw, sh) / 2;
      const rimWidth = s.type === 'felt-planter' ? Math.max(2, view.zoom * 0.06) : Math.max(3, view.zoom * 0.12);
      // Outer rim
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Inner fill
      ctx.fillStyle = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r - rimWidth, r - rimWidth, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.type === 'raised-bed') {
      const wallWidth = Math.max(3, view.zoom * 0.15);
      // Outer wall
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
      // Inner fill
      ctx.fillStyle = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
      ctx.fillRect(sx + wallWidth, sy + wallWidth, sw - wallWidth * 2, sh - wallWidth * 2);
    } else if (s.shape === 'circle') {
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

    if (showSurfaces && s.surface) {
      const pattern = getHatchPattern(ctx);
      if (pattern) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = pattern;
        // Clip to shape interior, excluding the border
        const inset = 1;
        if (s.shape === 'circle') {
          const cx = sx + sw / 2;
          const cy = sy + sh / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, sw / 2 - inset, sh / 2 - inset, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(sx + inset, sy + inset, sw - inset * 2, sh - inset * 2);
        }
        ctx.restore();
      }
    }

  }

  ctx.globalAlpha = 1;
}
