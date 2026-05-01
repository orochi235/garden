import type { RenderLayer } from '@orochi235/weasel';
import type { ZoneLayerData } from '../layerData';
import { worldToScreen } from '@orochi235/weasel';
import { renderLabel } from '@orochi235/weasel';
import type { PatternId } from '@orochi235/weasel';
import { renderPatternOverlay } from '@orochi235/weasel';

export const ZONE_LAYERS: RenderLayer<ZoneLayerData>[] = [
  {
    id: 'zone-bodies',
    label: 'Zone Bodies',
    alwaysOn: true,
    draw(ctx, data) {
      const { zones, view } = data;
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
      }
    },
  },
  {
    id: 'zone-patterns',
    label: 'Zone Patterns',
    draw(ctx, data) {
      const { zones, view } = data;
      const sorted = [...zones].sort((a, b) => a.zIndex - b.zIndex);
      for (const z of sorted) {
        if (!z.pattern) continue;
        const [sx, sy] = worldToScreen(z.x, z.y, view);
        const sw = z.width * view.zoom;
        const sh = z.height * view.zoom;
        renderPatternOverlay(ctx, z.pattern as PatternId, { x: sx, y: sy, w: sw, h: sh, shape: 'rectangle' });
      }
    },
  },
  {
    id: 'zone-highlights',
    label: 'Zone Highlights',
    draw(ctx, data) {
      const { zones, view, highlightOpacity } = data;
      if (highlightOpacity <= 0) return;
      const sorted = [...zones].sort((a, b) => a.zIndex - b.zIndex);
      for (const z of sorted) {
        const [sx, sy] = worldToScreen(z.x, z.y, view);
        const sw = z.width * view.zoom;
        const sh = z.height * view.zoom;
        ctx.save();
        ctx.globalAlpha = highlightOpacity;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.restore();
      }
    },
  },
  {
    id: 'zone-labels',
    label: 'Zone Labels',
    draw(ctx, data) {
      const { zones, view, labelMode, labelFontSize } = data;
      if (labelMode === 'none' || labelMode === 'selection') return;
      const sorted = [...zones].sort((a, b) => a.zIndex - b.zIndex);
      for (const z of sorted) {
        if (!z.label) continue;
        const [sx, sy] = worldToScreen(z.x, z.y, view);
        const sw = z.width * view.zoom;
        const sh = z.height * view.zoom;
        renderLabel(ctx, z.label, sx + sw / 2, sy + sh + 4, { fontSize: labelFontSize });
      }
    },
  },
];
