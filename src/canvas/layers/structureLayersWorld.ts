import type { Dims, View } from '@orochi235/weasel';
import { measureTextBounds, type RenderLayer, rectPath, textCommand } from '@orochi235/weasel';
import type { Structure } from '../../model/types';
import { paintFor } from '../patterns';
import { circlePolygon, type DrawCommand, viewToMat3 } from '../util/weaselLocal';
import type { GetUi, LayerDescriptor } from './worldLayerData';
import { descriptorById } from './worldLayerData';

/**
 * Single source of truth for structure-layer metadata. Order here = canonical
 * draw order. Factory pulls label/alwaysOn/defaultVisible from these entries
 * by id; `RenderLayersPanel` imports the array for the "Structures" group.
 *
 * Structure BODY rendering (walls, soil bodies, surface hatch, selection-flash
 * highlight ring) lives in the kit scene slot now (`createGardenDrawOne`), so
 * the old `structure-walls` / `structure-bodies` / `structure-surfaces` /
 * `structure-highlights` sub-layers were removed here. Per decision B, grouped
 * structures render as INDIVIDUAL bodies (via the scene slot) plus the existing
 * group-OUTLINE layer (`selectionLayersWorld.createGroupOutlineLayer`); the old
 * group-compound merged-fill rendering and its `buildStructureRenderQueue` were
 * deleted entirely. Only the non-body sub-layers remain.
 */
export const STRUCTURE_LAYER_DESCRIPTORS: readonly LayerDescriptor[] = [
  { id: 'structure-plantable-area', label: 'Plantable Area', defaultVisible: false },
  { id: 'structure-labels', label: 'Structure Labels' },
];

function pxToWorld(view: View, px: number): number {
  return px / Math.max(0.0001, view.scale.x);
}

/** Structures in canonical draw order (zIndex asc). Decision B renders grouped
 *  and ungrouped structures identically as individual bodies, so no grouping
 *  pass is needed here. */
function sortedStructures(getStructures: () => Structure[]): Structure[] {
  return [...getStructures()].sort((a, b) => a.zIndex - b.zIndex);
}

/**
 * Build the world-space structure layer set. The factory closes over a
 * `getStructures` reader so per-frame data assembly stays out of the layer
 * data object.
 */
export function createStructureLayers(
  getStructures: () => Structure[],
  getUi: GetUi,
): RenderLayer<unknown>[] {
  const meta = descriptorById(STRUCTURE_LAYER_DESCRIPTORS);
  return [
    {
      ...meta['structure-plantable-area'],
      space: 'screen' as const,
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const children: DrawCommand[] = [];
        for (const s of sortedStructures(getStructures)) {
          if (s.type !== 'pot' && s.type !== 'felt-planter' && s.type !== 'raised-bed') continue;
          if (s.type === 'pot' || s.type === 'felt-planter') {
            const cx = s.x + s.width / 2;
            const cy = s.y + s.length / 2;
            const r = Math.min(s.width, s.length) / 2;
            const rimWidth = Math.min(r, Math.max(pxToWorld(view, 1.5), s.wallThicknessFt));
            const innerR = r - rimWidth;
            const innerD = innerR * 2;
            if (innerD > 4) {
              children.push({
                kind: 'path',
                path: circlePolygon(cx, cy, innerR),
                fill: paintFor('hatch', { color: '#00FF00' }),
              });
            }
          } else {
            const wallWidth = Math.min(
              Math.min(s.width, s.length) / 2,
              Math.max(pxToWorld(view, 2), s.wallThicknessFt),
            );
            const iw = s.width - wallWidth * 2;
            const ih = s.length - wallWidth * 2;
            if (iw > 4 && ih > 4) {
              children.push({
                kind: 'path',
                path: rectPath(s.x + wallWidth, s.y + wallWidth, iw, ih),
                fill: paintFor('hatch', { color: '#00FF00' }),
              });
            }
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
    {
      ...meta['structure-labels'],
      space: 'screen' as const,
      // Flagged: text commands require registerFont() wired at app boot.
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const { labelMode, labelFontSize, debugOverlappingLabels } = getUi();
        if (labelMode === 'none' || labelMode === 'selection') return [];

        const fontPx = labelFontSize / Math.max(0.0001, view.scale.x);
        const padX = pxToWorld(view, 4);
        const padY = pxToWorld(view, 1);

        interface Entry {
          label: string;
          x: number;
          y: number;
          w: number;
          h: number;
        }
        // Measure via the MSDF atlas so pills fit the rendered glyphs exactly
        // (matches what `textCommand` draws). Labels use the default 'sans-serif'
        // family registered at app boot.
        const approxTextWidth = (text: string) =>
          measureTextBounds(text, { fontSize: fontPx }).width;
        const entries: Entry[] = [];
        for (const s of sortedStructures(getStructures)) {
          if (!s.label) continue;
          const cx = s.x + s.width / 2;
          const ly = s.y + s.length + pxToWorld(view, 4);
          const tw = approxTextWidth(s.label) + padX * 2;
          const th = fontPx + padY * 2;
          entries.push({ label: s.label, x: cx - tw / 2, y: ly - padY, w: tw, h: th });
        }

        const hidden = new Set<number>();
        for (let i = 0; i < entries.length; i++) {
          if (hidden.has(i)) continue;
          const a = entries[i];
          for (let j = i + 1; j < entries.length; j++) {
            if (hidden.has(j)) continue;
            const b = entries[j];
            if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
              hidden.add(j);
            }
          }
        }

        const children: DrawCommand[] = [];
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          const isHidden = hidden.has(i);
          if (isHidden && !debugOverlappingLabels) continue;
          const cmd: DrawCommand = textCommand(e.x + e.w / 2, e.y + padY, e.label, {
            fontSize: fontPx,
            align: 'center',
            fill: { fill: 'solid', color: '#ffffff' },
          });
          if (isHidden) {
            children.push({ kind: 'group', alpha: 0.4, children: [cmd] });
          } else {
            children.push(cmd);
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
  ];
}
