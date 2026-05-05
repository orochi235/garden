import { FILL_COLORS } from '../../model/types';
import type { Structure } from '../../model/types';
import type { RenderLayer } from '@orochi235/weasel';
import type { GetUi, LayerDescriptor, View } from './worldLayerData';
import { descriptorById } from './worldLayerData';
import { renderLabel } from '@orochi235/weasel';
import { renderPatternOverlay } from '../patterns';

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

function viewWorldRect(ctx: CanvasRenderingContext2D, view: View): { x: number; y: number; w: number; h: number } {
  const w = ctx.canvas.width / Math.max(0.0001, view.scale);
  const h = ctx.canvas.height / Math.max(0.0001, view.scale);
  return { x: view.x, y: view.y, w, h };
}

function drawSingleBody(
  ctx: CanvasRenderingContext2D,
  s: Structure,
  view: View,
): void {
  const x = s.x;
  const y = s.y;
  const w = s.width;
  const h = s.height;

  ctx.fillStyle = s.color;
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = pxToWorld(view, 1);

  if (s.type === 'pot' || s.type === 'felt-planter') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    const rimWidth = Math.min(r, Math.max(pxToWorld(view, 1.5), s.wallThicknessFt));
    // Soil disc only — walls (rim fill + outer stroke + felt overlay) live in
    // the `structure-walls` layer so toggling them off reveals just the soil.
    ctx.fillStyle = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r - rimWidth, r - rimWidth, 0, 0, Math.PI * 2);
    ctx.fill();
    if (s.fill === 'potting-mix') {
      const innerD = (r - rimWidth) * 2;
      if (innerD > 4) {
        renderPatternOverlay(ctx, 'chunks', {
          x: cx - (r - rimWidth), y: cy - (r - rimWidth), w: innerD, h: innerD, shape: 'circle',
        }, { params: { bg: FILL_COLORS[s.fill] } });
      }
    }
  } else if (s.type === 'raised-bed') {
    const wallWidth = Math.min(Math.min(w, h) / 2, Math.max(pxToWorld(view, 2), s.wallThicknessFt));
    // Soil rect only — walls (frame fill + outer/inner strokes) live in the
    // `structure-walls` layer.
    ctx.fillStyle = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
    ctx.fillRect(x + wallWidth, y + wallWidth, w - wallWidth * 2, h - wallWidth * 2);
    if (s.fill === 'potting-mix') {
      const iw = w - wallWidth * 2;
      const ih = h - wallWidth * 2;
      if (iw > 4 && ih > 4) {
        renderPatternOverlay(ctx, 'chunks', {
          x: x + wallWidth, y: y + wallWidth, w: iw, h: ih, shape: 'rectangle',
        }, { params: { bg: FILL_COLORS[s.fill] } });
      }
    }
  } else if (s.shape === 'circle') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!s.surface) ctx.stroke();
  } else {
    ctx.fillRect(x, y, w, h);
    if (!s.surface) ctx.strokeRect(x, y, w, h);
  }
}

function drawGroupBody(
  ctx: CanvasRenderingContext2D,
  members: Structure[],
  view: View,
): void {
  const compoundPath = new Path2D();
  for (const s of members) {
    if (s.shape === 'circle') {
      const cx = s.x + s.width / 2;
      const cy = s.y + s.height / 2;
      compoundPath.ellipse(cx, cy, s.width / 2, s.height / 2, 0, 0, Math.PI * 2);
    } else {
      compoundPath.rect(s.x, s.y, s.width, s.height);
    }
  }

  const color = members[0].color;
  ctx.fillStyle = color;
  ctx.fill(compoundPath);

  const allSurfaces = members.every((m) => m.surface);

  if (!allSurfaces) {
    ctx.save();
    const inverse = new Path2D();
    const r = viewWorldRect(ctx, view);
    inverse.rect(r.x, r.y, r.w, r.h);
    inverse.addPath(compoundPath);
    ctx.clip(inverse, 'evenodd');
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = pxToWorld(view, 2);
    ctx.stroke(compoundPath);
    ctx.restore();
  }
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
      draw(ctx, _data, view) {
        const { queue } = getQueue(getStructures);
        ctx.save();
        ctx.lineWidth = pxToWorld(view, 1);
        for (const item of queue) {
          const members = item.type === 'single' ? [item.structure] : item.members;
          for (const s of members) {
            if (s.type === 'pot' || s.type === 'felt-planter') {
              const cx = s.x + s.width / 2;
              const cy = s.y + s.height / 2;
              const r = Math.min(s.width, s.height) / 2;
              ctx.fillStyle = s.color;
              ctx.beginPath();
              ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
              ctx.fill();
              if (s.type === 'felt-planter') {
                const d = r * 2;
                if (d > 4) {
                  renderPatternOverlay(ctx, 'chunks', {
                    x: cx - r, y: cy - r, w: d, h: d, shape: 'circle',
                  }, { params: { bg: s.color, color: '#1a1a1a', density: 0.35, chunkSize: 1, size: 24, seed: 7 } });
                }
              }
              ctx.strokeStyle = s.type === 'pot' ? '#8a3a18' : '#333333';
              ctx.beginPath();
              ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
              ctx.stroke();
            } else if (s.type === 'raised-bed') {
              ctx.fillStyle = s.color;
              ctx.fillRect(s.x, s.y, s.width, s.height);
              ctx.strokeStyle = '#333333';
              ctx.strokeRect(s.x, s.y, s.width, s.height);
            }
          }
        }
        ctx.restore();
      },
    },
    {
      ...meta['structure-bodies'],
      draw(ctx, _data, view) {
        const { queue } = getQueue(getStructures);
        for (const item of queue) {
          if (item.type === 'single') drawSingleBody(ctx, item.structure, view);
          else drawGroupBody(ctx, item.members, view);
        }
      },
    },
    {
      ...meta['structure-surfaces'],
      draw(ctx, _data, _view) {
        const { queue } = getQueue(getStructures);
        for (const item of queue) {
          const members = item.type === 'single' ? [item.structure] : item.members;
          for (const s of members) {
            if (!s.surface) continue;
            renderPatternOverlay(ctx, 'hatch', {
              x: s.x, y: s.y, w: s.width, h: s.height,
              shape: s.shape === 'circle' ? 'circle' : 'rectangle',
            });
          }
        }
      },
    },
    {
      ...meta['structure-plantable-area'],
      draw(ctx, _data, view) {
        const { queue } = getQueue(getStructures);
        for (const item of queue) {
          const members = item.type === 'single' ? [item.structure] : item.members;
          for (const s of members) {
            if (s.type !== 'pot' && s.type !== 'felt-planter' && s.type !== 'raised-bed') continue;
            if (s.type === 'pot' || s.type === 'felt-planter') {
              const cx = s.x + s.width / 2;
              const cy = s.y + s.height / 2;
              const r = Math.min(s.width, s.height) / 2;
              const rimWidth = Math.min(r, Math.max(pxToWorld(view, 1.5), s.wallThicknessFt));
              const innerD = (r - rimWidth) * 2;
              if (innerD > 4) {
                renderPatternOverlay(ctx, 'hatch', {
                  x: cx - (r - rimWidth), y: cy - (r - rimWidth), w: innerD, h: innerD, shape: 'circle',
                }, { params: { color: '#00FF00' } });
              }
            } else {
              const wallWidth = Math.min(Math.min(s.width, s.height) / 2, Math.max(pxToWorld(view, 2), s.wallThicknessFt));
              const iw = s.width - wallWidth * 2;
              const ih = s.height - wallWidth * 2;
              if (iw > 4 && ih > 4) {
                renderPatternOverlay(ctx, 'hatch', {
                  x: s.x + wallWidth, y: s.y + wallWidth, w: iw, h: ih, shape: 'rectangle',
                }, { params: { color: '#00FF00' } });
              }
            }
          }
        }
      },
    },
    {
      ...meta['structure-highlights'],
      draw(ctx, _data, view) {
        const ui = getUi();
        const { getOpacity } = ui;
        const clashIds = ui.dragClashIds ?? [];
        const drawClashes = clashIds.length > 0;

        // Clash highlight: render a red-tinted ring on each structure whose
        // AABB intersects the dragging set. Shown alongside the gold
        // selection highlight; clears on drop / cancel.
        if (drawClashes) {
          const all = getStructures();
          const byId = new Map(all.map((s) => [s.id, s]));
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = '#E0413A';
          ctx.fillStyle = 'rgba(224, 65, 58, 0.15)';
          ctx.lineWidth = pxToWorld(view, 2);
          ctx.setLineDash([]);
          for (const id of clashIds) {
            const s = byId.get(id);
            if (!s) continue;
            if (s.shape === 'circle') {
              ctx.beginPath();
              ctx.ellipse(s.x + s.width / 2, s.y + s.height / 2, s.width / 2, s.height / 2, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            } else {
              ctx.fillRect(s.x, s.y, s.width, s.height);
              ctx.strokeRect(s.x, s.y, s.width, s.height);
            }
          }
          ctx.restore();
        }

        const { queue } = getQueue(getStructures);
        // Skip the save/setup if no structure is currently flashing — keeps
        // the test that expects no `save()` when nothing's flashing happy.
        let any = false;
        for (const item of queue) {
          const members = item.type === 'single' ? [item.structure] : item.members;
          for (const s of members) {
            if (getOpacity(s.id) > 0) { any = true; break; }
          }
          if (any) break;
        }
        if (!any) return;

        ctx.save();
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = pxToWorld(view, 2);
        ctx.setLineDash([]);

        for (const item of queue) {
          if (item.type === 'single') {
            const s = item.structure;
            const op = getOpacity(s.id);
            if (op <= 0) continue;
            ctx.globalAlpha = op;
            if (s.shape === 'circle') {
              ctx.beginPath();
              ctx.ellipse(s.x + s.width / 2, s.y + s.height / 2, s.width / 2, s.height / 2, 0, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              ctx.strokeRect(s.x, s.y, s.width, s.height);
            }
          } else {
            // Group highlight: take max opacity over members so the compound
            // outline pulses as a unit when any member flashes.
            let groupOp = 0;
            for (const s of item.members) {
              const o = getOpacity(s.id);
              if (o > groupOp) groupOp = o;
            }
            if (groupOp <= 0) continue;
            const compound = new Path2D();
            for (const s of item.members) {
              if (s.shape === 'circle') {
                compound.ellipse(s.x + s.width / 2, s.y + s.height / 2, s.width / 2, s.height / 2, 0, 0, Math.PI * 2);
              } else {
                compound.rect(s.x, s.y, s.width, s.height);
              }
            }
            ctx.save();
            ctx.globalAlpha = groupOp;
            const inverse = new Path2D();
            const r = viewWorldRect(ctx, view);
            inverse.rect(r.x, r.y, r.w, r.h);
            inverse.addPath(compound);
            ctx.clip(inverse, 'evenodd');
            ctx.lineWidth = pxToWorld(view, 4);
            ctx.stroke(compound);
            ctx.restore();
          }
        }
        ctx.restore();
      },
    },
    {
      ...meta['structure-labels'],
      draw(ctx, _data, view) {
        const { labelMode, labelFontSize, debugOverlappingLabels } = getUi();
        if (labelMode === 'none' || labelMode === 'selection') return;
        const { queue } = getQueue(getStructures);

        const fontPx = labelFontSize / Math.max(0.0001, view.scale);
        const padX = pxToWorld(view, 4);
        const padY = pxToWorld(view, 1);

        ctx.save();
        ctx.font = `${fontPx}px sans-serif`;

        interface Entry { label: string; x: number; y: number; w: number; h: number }
        const entries: Entry[] = [];
        for (const item of queue) {
          const members = item.type === 'single' ? [item.structure] : item.members;
          for (const s of members) {
            if (!s.label) continue;
            const cx = s.x + s.width / 2;
            const ly = s.y + s.height + pxToWorld(view, 4);
            const tw = ctx.measureText(s.label).width + padX * 2;
            const th = fontPx + padY * 2;
            entries.push({ label: s.label, x: cx - tw / 2, y: ly - padY, w: tw, h: th });
          }
        }
        ctx.restore();

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

        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          const isHidden = hidden.has(i);
          if (isHidden && !debugOverlappingLabels) continue;
          if (isHidden) { ctx.save(); ctx.globalAlpha = 0.4; }
          renderLabel(ctx, e.label, e.x + e.w / 2, e.y + padY, {
            fontSize: fontPx,
            padX: fontPx * (4 / 13),
            padY: fontPx * (1 / 13),
            cornerRadius: fontPx * (3 / 13),
          });
          if (isHidden) ctx.restore();
        }
      },
    },
  ];
}
