import { FILL_COLORS } from '../model/types';
import type { Structure } from '../model/types';
import type { LabelMode } from '../store/uiStore';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';
import { renderLabel } from './renderLabel';
import { renderPatternOverlay } from './patterns';

export function renderStructures(
  ctx: CanvasRenderingContext2D,
  structures: Structure[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  highlightOpacity: number = 0,
  showSurfaces: boolean = false,
  skipClear: boolean = false,
  labelMode: LabelMode | 'none' = 'none',
): void {
  if (!skipClear) ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (structures.length === 0) return;

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
      const rimWidth = s.type === 'felt-planter' ? Math.max(1.5, view.zoom * 0.04) : Math.max(2, view.zoom * 0.06);
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
      // Soil texture for potting mix
      if (s.fill === 'potting-mix') {
        const innerD = (r - rimWidth) * 2;
        renderPatternOverlay(ctx, 'chunks', {
          x: cx - (r - rimWidth), y: cy - (r - rimWidth), w: innerD, h: innerD, shape: 'circle',
        }, { params: { bg: FILL_COLORS[s.fill] } });
      }
    } else if (s.type === 'raised-bed') {
      const wallWidth = Math.max(3, view.zoom * 0.15);
      // Outer wall
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
      // Inner fill
      ctx.fillStyle = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
      ctx.fillRect(sx + wallWidth, sy + wallWidth, sw - wallWidth * 2, sh - wallWidth * 2);
      // Soil texture for potting mix
      if (s.fill === 'potting-mix') {
        renderPatternOverlay(ctx, 'chunks', {
          x: sx + wallWidth, y: sy + wallWidth, w: sw - wallWidth * 2, h: sh - wallWidth * 2, shape: 'rectangle',
        }, { params: { bg: FILL_COLORS[s.fill] } });
      }
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

    if (highlightOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = highlightOpacity;
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
      ctx.restore();
    }

    if (showSurfaces && s.surface) {
      renderPatternOverlay(ctx, 'hatch', {
        x: sx, y: sy, w: sw, h: sh,
        shape: s.shape === 'circle' ? 'circle' : 'rectangle',
      });
    }

    if (labelMode !== 'none' && labelMode !== 'selection' && s.label) {
      renderLabel(ctx, s.label, sx + sw / 2, sy + sh + 4, { fontSize: 10 });
    }

  }

}
