import type { RenderLayer } from '@orochi235/weasel';
import { renderLabel } from '@orochi235/weasel';
import { renderPatternOverlay, type PatternId } from '../patterns';
import type { Zone } from '../../model/types';
import type { GetUi, LayerDescriptor, View } from './worldLayerData';
import { descriptorById } from './worldLayerData';

function px(view: View, p: number): number {
  return p / Math.max(0.0001, view.scale);
}

/**
 * Single source of truth for zone-layer metadata. Order here = canonical
 * draw order. The factory below pulls `label`/`alwaysOn`/`defaultVisible`
 * from these entries by id, and `RenderLayersPanel` imports the array to
 * build its "Zones" group.
 */
export const ZONE_LAYER_DESCRIPTORS: readonly LayerDescriptor[] = [
  { id: 'zone-bodies', label: 'Zone Bodies', alwaysOn: true },
  { id: 'zone-patterns', label: 'Zone Patterns' },
  { id: 'zone-highlights', label: 'Zone Highlights' },
  { id: 'zone-labels', label: 'Zone Labels' },
];

export function createZoneLayers(getZones: () => Zone[], getUi: GetUi): RenderLayer<unknown>[] {
  const meta = descriptorById(ZONE_LAYER_DESCRIPTORS);
  return [
    {
      ...meta['zone-bodies'],
      draw(ctx, _data, view) {
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        for (const z of sorted) {
          ctx.fillStyle = z.color;
          ctx.fillRect(z.x, z.y, z.width, z.length);

          ctx.strokeStyle = '#4A7C59';
          ctx.lineWidth = px(view, 1.5);
          // setLineDash takes pixel-space values, but ctx is world-scaled, so
          // dash sizes need world-unit scaling too.
          ctx.setLineDash([px(view, 6), px(view, 3)]);
          ctx.strokeRect(z.x, z.y, z.width, z.length);
          ctx.setLineDash([]);
        }
      },
    },
    {
      ...meta['zone-patterns'],
      draw(ctx, _data, _view) {
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        for (const z of sorted) {
          if (!z.pattern) continue;
          renderPatternOverlay(ctx, z.pattern as PatternId, {
            x: z.x, y: z.y, w: z.width, h: z.length, shape: 'rectangle',
          });
        }
      },
    },
    {
      ...meta['zone-highlights'],
      draw(ctx, _data, view) {
        const { getOpacity } = getUi();
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        for (const z of sorted) {
          const opacity = getOpacity(z.id);
          if (opacity <= 0) continue;
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = px(view, 2);
          ctx.setLineDash([]);
          ctx.strokeRect(z.x, z.y, z.width, z.length);
          ctx.restore();
        }
      },
    },
    {
      ...meta['zone-labels'],
      draw(ctx, _data, view) {
        const ui = getUi();
        if (ui.labelMode === 'none' || ui.labelMode === 'selection') return;
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        const fontPx = ui.labelFontSize / Math.max(0.0001, view.scale);
        for (const z of sorted) {
          if (!z.label) continue;
          renderLabel(ctx, z.label, z.x + z.width / 2, z.y + z.length + px(view, 4), {
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
