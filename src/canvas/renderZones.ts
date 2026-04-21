import type { Zone } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';
import type { PatternId } from './patterns';
import { renderPatternOverlay } from './patterns';

export function renderZones(
  ctx: CanvasRenderingContext2D,
  zones: Zone[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  highlightOpacity: number = 0,
  patternOverride: PatternId | null = null,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
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

    if (patternOverride) {
      renderPatternOverlay(ctx, patternOverride, { x: sx, y: sy, w: sw, h: sh, shape: 'rectangle' });
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

  }

}
