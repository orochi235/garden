import type { RenderLayer } from '@orochi235/weasel';
import { renderLabel } from '@orochi235/weasel';
import { renderPatternOverlay, type PatternId } from '../patterns';
import type { Zone } from '../../model/types';
import type { GetUi, View } from './worldLayerData';

function px(view: View, p: number): number {
  return p / Math.max(0.0001, view.scale);
}

export function createZoneLayers(getZones: () => Zone[], getUi: GetUi): RenderLayer<unknown>[] {
  return [
    {
      id: 'zone-bodies',
      label: 'Zone Bodies',
      alwaysOn: true,
      draw(ctx, _data, view) {
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        for (const z of sorted) {
          ctx.fillStyle = z.color;
          ctx.fillRect(z.x, z.y, z.width, z.height);

          ctx.strokeStyle = '#4A7C59';
          ctx.lineWidth = px(view, 1.5);
          // setLineDash takes pixel-space values, but ctx is world-scaled, so
          // dash sizes need world-unit scaling too.
          ctx.setLineDash([px(view, 6), px(view, 3)]);
          ctx.strokeRect(z.x, z.y, z.width, z.height);
          ctx.setLineDash([]);
        }
      },
    },
    {
      id: 'zone-patterns',
      label: 'Zone Patterns',
      draw(ctx, _data, _view) {
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        for (const z of sorted) {
          if (!z.pattern) continue;
          renderPatternOverlay(ctx, z.pattern as PatternId, {
            x: z.x, y: z.y, w: z.width, h: z.height, shape: 'rectangle',
          });
        }
      },
    },
    {
      id: 'zone-highlights',
      label: 'Zone Highlights',
      draw(ctx, _data, view) {
        const ui = getUi();
        if (ui.highlightOpacity <= 0) return;
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        for (const z of sorted) {
          ctx.save();
          ctx.globalAlpha = ui.highlightOpacity;
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = px(view, 2);
          ctx.setLineDash([]);
          ctx.strokeRect(z.x, z.y, z.width, z.height);
          ctx.restore();
        }
      },
    },
    {
      id: 'zone-labels',
      label: 'Zone Labels',
      draw(ctx, _data, view) {
        const ui = getUi();
        if (ui.labelMode === 'none' || ui.labelMode === 'selection') return;
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        const fontPx = ui.labelFontSize / Math.max(0.0001, view.scale);
        for (const z of sorted) {
          if (!z.label) continue;
          renderLabel(ctx, z.label, z.x + z.width / 2, z.y + z.height + px(view, 4), {
            fontSize: fontPx,
            padX: px(view, 4),
            padY: px(view, 1),
            cornerRadius: px(view, 3),
          });
        }
      },
    },
  ];
}
