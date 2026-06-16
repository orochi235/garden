import type { Dims, View } from '@orochi235/weasel';
import { type RenderLayer, textCommand } from '@orochi235/weasel';
import type { Zone } from '../../model/types';
import { type DrawCommand, viewToMat3 } from '../util/weaselLocal';
import type { GetUi, LayerDescriptor } from './worldLayerData';
import { descriptorById } from './worldLayerData';

function px(view: View, p: number): number {
  return p / Math.max(0.0001, view.scale.x);
}

/**
 * Single source of truth for zone-layer metadata. Order here = canonical
 * draw order. The factory below pulls `label`/`alwaysOn`/`defaultVisible`
 * from these entries by id, and `RenderLayersPanel` imports the array to
 * build its "Zones" group.
 *
 * Zone BODY rendering (body fill + dashed outline, patterns, selection-flash
 * highlight) lives in the kit scene slot now (`createGardenDrawOne`), so the
 * old `zone-bodies` / `zone-patterns` / `zone-highlights` sub-layers were
 * removed here. Only the label sub-layer remains.
 */
export const ZONE_LAYER_DESCRIPTORS: readonly LayerDescriptor[] = [
  { id: 'zone-labels', label: 'Zone Labels' },
];

export function createZoneLayers(getZones: () => Zone[], getUi: GetUi): RenderLayer<unknown>[] {
  const meta = descriptorById(ZONE_LAYER_DESCRIPTORS);
  return [
    {
      ...meta['zone-labels'],
      space: 'screen' as const,
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const ui = getUi();
        if (ui.labelMode === 'none' || ui.labelMode === 'selection') return [];
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        const fontPx = ui.labelFontSize / Math.max(0.0001, view.scale.x);
        // Flagged: text rendering requires registerFont() wired at app boot.
        const children: DrawCommand[] = sorted
          .filter((z) => !!z.label)
          .map((z) =>
            textCommand(z.x + z.width / 2, z.y + z.length + px(view, 4), z.label!, {
              fontSize: fontPx,
              align: 'center',
              fill: { fill: 'solid', color: '#ffffff' },
            }),
          );
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
  ];
}
