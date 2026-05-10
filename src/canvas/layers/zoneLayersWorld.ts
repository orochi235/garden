import {
  type RenderLayer,
  rectPath,
} from '@orochi235/weasel';
import { type DrawCommand, viewToMat3 } from '../util/weaselLocal';
import { paintFor, type PatternId } from '../patterns';
import type { Dims, View } from '@orochi235/weasel';
import type { Zone } from '../../model/types';
import type { GetUi, LayerDescriptor } from './worldLayerData';
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
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        const dashSize = 6 / Math.max(0.0001, view.scale);
        const gapSize = 3 / Math.max(0.0001, view.scale);
        const children: DrawCommand[] = sorted.flatMap((z) => [
          {
            kind: 'path' as const,
            path: rectPath(z.x, z.y, z.width, z.length),
            fill: { fill: 'solid' as const, color: z.color },
          },
          {
            kind: 'path' as const,
            path: rectPath(z.x, z.y, z.width, z.length),
            stroke: {
              paint: { fill: 'solid' as const, color: '#4A7C59' },
              width: px(view, 1.5),
              dash: [dashSize, gapSize],
            },
          },
        ]);
        return [{ kind: 'group', transform: new Float32Array(viewToMat3(view)), children }];
      },
    },
    {
      ...meta['zone-patterns'],
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        const children: DrawCommand[] = sorted
          .filter((z) => z.pattern != null)
          .map((z) => ({
            kind: 'path' as const,
            path: rectPath(z.x, z.y, z.width, z.length),
            fill: paintFor(z.pattern as PatternId),
          }));
        return [{ kind: 'group', transform: new Float32Array(viewToMat3(view)), children }];
      },
    },
    {
      ...meta['zone-highlights'],
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const { getHighlight } = getUi();
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        const children: DrawCommand[] = sorted
          .filter((z) => getHighlight(z.id) > 0)
          .map((z) => ({
            kind: 'group' as const,
            alpha: getHighlight(z.id),
            children: [
              {
                kind: 'path' as const,
                path: rectPath(z.x, z.y, z.width, z.length),
                stroke: {
                  paint: { fill: 'solid' as const, color: '#FFD700' },
                  width: px(view, 2),
                },
              },
            ],
          }));
        return [{ kind: 'group', transform: new Float32Array(viewToMat3(view)), children }];
      },
    },
    {
      ...meta['zone-labels'],
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const ui = getUi();
        if (ui.labelMode === 'none' || ui.labelMode === 'selection') return [];
        const sorted = [...getZones()].sort((a, b) => a.zIndex - b.zIndex);
        const fontPx = ui.labelFontSize / Math.max(0.0001, view.scale);
        // Flagged: text rendering requires registerFont() wired at app boot.
        const children: DrawCommand[] = sorted
          .filter((z) => !!z.label)
          .map((z) => ({
            kind: 'text' as const,
            x: z.x + z.width / 2,
            y: z.y + z.length + px(view, 4),
            text: z.label!,
            style: {
              fontSize: fontPx,
              align: 'center' as const,
              fill: { fill: 'solid' as const, color: '#ffffff' },
            },
          }));
        return [{ kind: 'group', transform: new Float32Array(viewToMat3(view)), children }];
      },
    },
  ];
}
