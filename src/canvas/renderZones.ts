import type { Zone } from '../model/types';
import { worldToScreen } from '@/canvas-kit';
import { renderLabel } from '@/canvas-kit';
import type { PatternId } from '@/canvas-kit';
import { renderPatternOverlay } from '@/canvas-kit';
import type { ZoneRenderOptions } from './renderOptions';

export function renderZones(
  ctx: CanvasRenderingContext2D,
  zones: Zone[],
  opts: ZoneRenderOptions,
): void {
  const {
    view,
    canvasWidth,
    canvasHeight,
    highlightOpacity = 0,
    skipClear = false,
    labelMode = 'none',
    labelFontSize = 13,
    patternOverride = null,
  } = opts;

  if (!skipClear) ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (zones.length === 0) return;

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

    const pattern = patternOverride ?? z.pattern;
    if (pattern) {
      renderPatternOverlay(ctx, pattern as PatternId, { x: sx, y: sy, w: sw, h: sh, shape: 'rectangle' });
    }

    if (highlightOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = highlightOpacity;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.restore();
    }

    if (labelMode !== 'none' && labelMode !== 'selection' && z.label) {
      renderLabel(ctx, z.label, sx + sw / 2, sy + sh + 4, { fontSize: labelFontSize });
    }

  }

}
