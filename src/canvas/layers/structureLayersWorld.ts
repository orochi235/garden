import {
  type RenderLayer,
  rectPath,
  textCommand,
} from '@orochi235/weasel';
import { type DrawCommand, viewToMat3, circlePolygon, ellipsePolygon } from '../util/weaselLocal';
import { paintFor } from '../patterns';
import type { Dims, View } from '@orochi235/weasel';
import { FILL_COLORS } from '../../model/types';
import type { Structure } from '../../model/types';
import type { GetUi, LayerDescriptor } from './worldLayerData';
import { descriptorById } from './worldLayerData';

/**
 * Single source of truth for structure-layer metadata. Order here = canonical
 * draw order. Factory pulls label/alwaysOn/defaultVisible from these entries
 * by id; `RenderLayersPanel` imports the array for the "Structures" group.
 */
export const STRUCTURE_LAYER_DESCRIPTORS: readonly LayerDescriptor[] = [
  { id: 'structure-walls', label: 'Structure Walls' },
  { id: 'structure-bodies', label: 'Structure Bodies', alwaysOn: true },
  { id: 'structure-surfaces', label: 'Structure Surfaces' },
  { id: 'structure-plantable-area', label: 'Plantable Area', defaultVisible: false },
  { id: 'structure-highlights', label: 'Structure Highlights' },
  { id: 'structure-labels', label: 'Structure Labels' },
];

type StructureRenderItem =
  | { type: 'single'; structure: Structure; order: number }
  | { type: 'group'; members: Structure[]; order: number };

/** Sort structures, separate grouped vs ungrouped, and build an interleaved render queue. */
function buildStructureRenderQueue(structures: Structure[]): {
  renderQueue: StructureRenderItem[];
  groups: Map<string, Structure[]>;
} {
  const sorted = [...structures].sort((a, b) => a.zIndex - b.zIndex);
  const groups = new Map<string, Structure[]>();
  const ungrouped: Structure[] = [];
  const groupOrder = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.groupId) {
      const members = groups.get(s.groupId);
      if (members) members.push(s);
      else { groups.set(s.groupId, [s]); groupOrder.set(s.groupId, i); }
    } else {
      ungrouped.push(s);
    }
  }
  const renderQueue: StructureRenderItem[] = [];
  for (const s of ungrouped) renderQueue.push({ type: 'single', structure: s, order: sorted.indexOf(s) });
  for (const [groupId, members] of groups) renderQueue.push({ type: 'group', members, order: groupOrder.get(groupId)! });
  renderQueue.sort((a, b) => a.order - b.order);
  return { renderQueue, groups };
}

function pxToWorld(view: View, px: number): number {
  return px / Math.max(0.0001, view.scale);
}


function getQueue(getStructures: () => Structure[]): { queue: StructureRenderItem[] } {
  const { renderQueue } = buildStructureRenderQueue(getStructures());
  return { queue: renderQueue };
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
      ...meta['structure-walls'],
      // Walls draw the outer ring/frame for containers (pot/felt-planter/
      // raised-bed). Soil disc/rect lives in `structure-bodies` so toggling
      // walls off reveals just the soil.
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const { queue } = getQueue(getStructures);
        const lw = pxToWorld(view, 1);
        const children: DrawCommand[] = [];
        for (const item of queue) {
          const members = item.type === 'single' ? [item.structure] : item.members;
          for (const s of members) {
            if (s.type === 'pot' || s.type === 'felt-planter') {
              const cx = s.x + s.width / 2;
              const cy = s.y + s.length / 2;
              const r = Math.min(s.width, s.length) / 2;
              children.push({
                kind: 'path',
                path: circlePolygon(cx, cy, r),
                fill: { fill: 'solid', color: s.color },
                stroke: {
                  paint: { fill: 'solid', color: s.type === 'pot' ? '#8a3a18' : '#333333' },
                  width: lw,
                },
              });
              if (s.type === 'felt-planter') {
                const d = r * 2;
                if (d > 4) {
                  children.push({
                    kind: 'path',
                    path: circlePolygon(cx, cy, r),
                    fill: paintFor('chunks', {
                      bg: s.color, color: '#1a1a1a', density: 0.35, chunkSize: 1, size: 24, seed: 7,
                    }),
                  });
                }
              }
            } else if (s.type === 'raised-bed') {
              children.push({
                kind: 'path',
                path: rectPath(s.x, s.y, s.width, s.length),
                fill: { fill: 'solid', color: s.color },
                stroke: { paint: { fill: 'solid', color: '#333333' }, width: lw },
              });
            }
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
    {
      ...meta['structure-bodies'],
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const { queue } = getQueue(getStructures);
        const lw = pxToWorld(view, 1);
        const children: DrawCommand[] = [];

        for (const item of queue) {
          if (item.type === 'single') {
            const s = item.structure;
            const x = s.x, y = s.y, w = s.width, h = s.length;

            if (s.type === 'pot' || s.type === 'felt-planter') {
              const cx = x + w / 2;
              const cy = y + h / 2;
              const r = Math.min(w, h) / 2;
              const rimWidth = Math.min(r, Math.max(pxToWorld(view, 1.5), s.wallThicknessFt));
              const innerR = r - rimWidth;
              const soilColor = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
              children.push({
                kind: 'path',
                path: circlePolygon(cx, cy, innerR),
                fill: { fill: 'solid', color: soilColor },
              });
              if (s.fill === 'potting-mix') {
                const innerD = innerR * 2;
                if (innerD > 4) {
                  children.push({
                    kind: 'path',
                    path: circlePolygon(cx, cy, innerR),
                    fill: paintFor('chunks', { bg: soilColor }),
                  });
                }
              }
            } else if (s.type === 'raised-bed') {
              const wallWidth = Math.min(Math.min(w, h) / 2, Math.max(pxToWorld(view, 2), s.wallThicknessFt));
              const soilColor = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
              children.push({
                kind: 'path',
                path: rectPath(x + wallWidth, y + wallWidth, w - wallWidth * 2, h - wallWidth * 2),
                fill: { fill: 'solid', color: soilColor },
              });
              if (s.fill === 'potting-mix') {
                const iw = w - wallWidth * 2;
                const ih = h - wallWidth * 2;
                if (iw > 4 && ih > 4) {
                  children.push({
                    kind: 'path',
                    path: rectPath(x + wallWidth, y + wallWidth, iw, ih),
                    fill: paintFor('chunks', { bg: soilColor }),
                  });
                }
              }
            } else if (s.shape === 'circle') {
              const cx = x + w / 2;
              const cy = y + h / 2;
              children.push({
                kind: 'path',
                path: ellipsePolygon(cx, cy, w / 2, h / 2),
                fill: { fill: 'solid', color: s.color },
                ...(s.surface ? {} : { stroke: { paint: { fill: 'solid' as const, color: '#333333' }, width: lw } }),
              });
            } else {
              children.push({
                kind: 'path',
                path: rectPath(x, y, w, h),
                fill: { fill: 'solid', color: s.color },
                ...(s.surface ? {} : { stroke: { paint: { fill: 'solid' as const, color: '#333333' }, width: lw } }),
              });
            }
          } else {
            // Group: compound fill. Stroke is approximated per-member since
            // DrawCommand has no even-odd compound-clip equivalent here.
            const color = item.members[0].color;
            const allSurfaces = item.members.every((m) => m.surface);
            for (const s of item.members) {
              const path = s.shape === 'circle'
                ? ellipsePolygon(s.x + s.width / 2, s.y + s.length / 2, s.width / 2, s.length / 2)
                : rectPath(s.x, s.y, s.width, s.length);
              children.push({
                kind: 'path',
                path,
                fill: { fill: 'solid', color },
                ...(!allSurfaces ? { stroke: { paint: { fill: 'solid' as const, color: '#333333' }, width: pxToWorld(view, 2) } } : {}),
              });
            }
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
    {
      ...meta['structure-surfaces'],
      draw(_data, _view: View, _dims: Dims): DrawCommand[] {
        const { queue } = getQueue(getStructures);
        const children: DrawCommand[] = [];
        for (const item of queue) {
          const members = item.type === 'single' ? [item.structure] : item.members;
          for (const s of members) {
            if (!s.surface) continue;
            const path = s.shape === 'circle'
              ? ellipsePolygon(s.x + s.width / 2, s.y + s.length / 2, s.width / 2, s.length / 2)
              : rectPath(s.x, s.y, s.width, s.length);
            children.push({
              kind: 'path',
              path,
              fill: paintFor('hatch'),
            });
          }
        }
        return [{ kind: 'group', transform: viewToMat3(_view), children }];
      },
    },
    {
      ...meta['structure-plantable-area'],
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const { queue } = getQueue(getStructures);
        const children: DrawCommand[] = [];
        for (const item of queue) {
          const members = item.type === 'single' ? [item.structure] : item.members;
          for (const s of members) {
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
              const wallWidth = Math.min(Math.min(s.width, s.length) / 2, Math.max(pxToWorld(view, 2), s.wallThicknessFt));
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
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
    {
      ...meta['structure-highlights'],
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const ui = getUi();
        const { getHighlight } = ui;
        const clashIds = ui.dragClashIds ?? [];
        const drawClashes = clashIds.length > 0;

        const children: DrawCommand[] = [];

        // Clash highlight: render a red-tinted ring on each structure whose
        // AABB intersects the dragging set.
        if (drawClashes) {
          const all = getStructures();
          const byId = new Map(all.map((s) => [s.id, s]));
          const clashChildren: DrawCommand[] = [];
          for (const id of clashIds) {
            const s = byId.get(id);
            if (!s) continue;
            const path = s.shape === 'circle'
              ? ellipsePolygon(s.x + s.width / 2, s.y + s.length / 2, s.width / 2, s.length / 2)
              : rectPath(s.x, s.y, s.width, s.length);
            clashChildren.push({
              kind: 'path',
              path,
              fill: { fill: 'solid', color: 'rgba(224, 65, 58, 0.15)' },
              stroke: { paint: { fill: 'solid', color: '#E0413A' }, width: pxToWorld(view, 2) },
            });
          }
          if (clashChildren.length > 0) {
            children.push({ kind: 'group', alpha: 0.85, children: clashChildren });
          }
        }

        const { queue } = getQueue(getStructures);
        let any = false;
        for (const item of queue) {
          const members = item.type === 'single' ? [item.structure] : item.members;
          for (const s of members) {
            if (getHighlight(s.id) > 0) { any = true; break; }
          }
          if (any) break;
        }
        if (!any) return children.length > 0
          ? [{ kind: 'group', transform: viewToMat3(view), children }]
          : [];

        for (const item of queue) {
          if (item.type === 'single') {
            const s = item.structure;
            const op = getHighlight(s.id);
            if (op <= 0) continue;
            const path = s.shape === 'circle'
              ? ellipsePolygon(s.x + s.width / 2, s.y + s.length / 2, s.width / 2, s.length / 2)
              : rectPath(s.x, s.y, s.width, s.length);
            children.push({
              kind: 'group',
              alpha: op,
              children: [{
                kind: 'path',
                path,
                stroke: { paint: { fill: 'solid', color: '#FFD700' }, width: pxToWorld(view, 2) },
              }],
            });
          } else {
            // Group highlight: take max opacity over members.
            let groupOp = 0;
            for (const s of item.members) {
              const o = getHighlight(s.id);
              if (o > groupOp) groupOp = o;
            }
            if (groupOp <= 0) continue;
            const memberCmds: DrawCommand[] = item.members.map((s) => ({
              kind: 'path' as const,
              path: s.shape === 'circle'
                ? ellipsePolygon(s.x + s.width / 2, s.y + s.length / 2, s.width / 2, s.length / 2)
                : rectPath(s.x, s.y, s.width, s.length),
              stroke: { paint: { fill: 'solid' as const, color: '#FFD700' }, width: pxToWorld(view, 4) },
            }));
            children.push({ kind: 'group', alpha: groupOp, children: memberCmds });
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
    {
      ...meta['structure-labels'],
      // Flagged: text commands require registerFont() wired at app boot.
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const { labelMode, labelFontSize, debugOverlappingLabels } = getUi();
        if (labelMode === 'none' || labelMode === 'selection') return [];
        const { queue } = getQueue(getStructures);

        const fontPx = labelFontSize / Math.max(0.0001, view.scale);
        const padX = pxToWorld(view, 4);
        const padY = pxToWorld(view, 1);

        interface Entry { label: string; x: number; y: number; w: number; h: number }
        // Approximate text width: ~0.6× fontPx per character (no canvas.measureText available).
        const approxTextWidth = (text: string) => text.length * fontPx * 0.6;
        const entries: Entry[] = [];
        for (const item of queue) {
          const members = item.type === 'single' ? [item.structure] : item.members;
          for (const s of members) {
            if (!s.label) continue;
            const cx = s.x + s.width / 2;
            const ly = s.y + s.length + pxToWorld(view, 4);
            const tw = approxTextWidth(s.label) + padX * 2;
            const th = fontPx + padY * 2;
            entries.push({ label: s.label, x: cx - tw / 2, y: ly - padY, w: tw, h: th });
          }
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
