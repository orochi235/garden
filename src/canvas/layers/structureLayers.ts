import { FILL_COLORS } from '../../model/types';
import type { Structure } from '../../model/types';
import type { RenderLayer } from '../renderLayer';
import type { StructureLayerData, StructureRenderItem } from '../layerData';
import { worldToScreen } from '../../utils/grid';
import { renderLabel } from '../renderLabel';
import { renderPatternOverlay } from '../patterns';

/** Sort structures, separate grouped vs ungrouped, and build an interleaved render queue. */
export function buildStructureRenderQueue(structures: Structure[]): {
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
      if (members) {
        members.push(s);
      } else {
        groups.set(s.groupId, [s]);
        groupOrder.set(s.groupId, i);
      }
    } else {
      ungrouped.push(s);
    }
  }

  const renderQueue: StructureRenderItem[] = [];

  for (const s of ungrouped) {
    renderQueue.push({ type: 'single', structure: s, order: sorted.indexOf(s) });
  }
  for (const [groupId, members] of groups) {
    renderQueue.push({ type: 'group', members, order: groupOrder.get(groupId)! });
  }
  renderQueue.sort((a, b) => a.order - b.order);

  return { renderQueue, groups };
}

function drawSingleBody(
  ctx: CanvasRenderingContext2D,
  s: Structure,
  view: { panX: number; panY: number; zoom: number },
): void {
  const [sx, sy] = worldToScreen(s.x, s.y, view);
  const sw = s.width * view.zoom;
  const sh = s.height * view.zoom;

  ctx.fillStyle = s.color;
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 1;

  if (s.type === 'pot' || s.type === 'felt-planter') {
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    const r = Math.min(sw, sh) / 2;
    const rimWidth = Math.max(1.5, s.wallThicknessFt * view.zoom);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
    if (s.type === 'pot') {
      ctx.save();
      ctx.strokeStyle = '#8a3a18';
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.stroke();
    }
    ctx.fillStyle = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r - rimWidth, r - rimWidth, 0, 0, Math.PI * 2);
    ctx.fill();
    if (s.fill === 'potting-mix') {
      const innerD = (r - rimWidth) * 2;
      renderPatternOverlay(ctx, 'chunks', {
        x: cx - (r - rimWidth), y: cy - (r - rimWidth), w: innerD, h: innerD, shape: 'circle',
      }, { params: { bg: FILL_COLORS[s.fill] } });
    }
  } else if (s.type === 'raised-bed') {
    const wallWidth = Math.max(2, s.wallThicknessFt * view.zoom);
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.fillStyle = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
    ctx.fillRect(sx + wallWidth, sy + wallWidth, sw - wallWidth * 2, sh - wallWidth * 2);
    ctx.strokeRect(sx + wallWidth, sy + wallWidth, sw - wallWidth * 2, sh - wallWidth * 2);
    if (s.fill === 'potting-mix') {
      renderPatternOverlay(ctx, 'chunks', {
        x: sx + wallWidth, y: sy + wallWidth, w: sw - wallWidth * 2, h: sh - wallWidth * 2, shape: 'rectangle',
      }, { params: { bg: FILL_COLORS[s.fill] } });
    }
  } else if (s.shape === 'circle') {
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!s.surface) ctx.stroke();
  } else {
    ctx.fillRect(sx, sy, sw, sh);
    if (!s.surface) ctx.strokeRect(sx, sy, sw, sh);
  }
}

function drawGroupBody(
  ctx: CanvasRenderingContext2D,
  members: Structure[],
  view: { panX: number; panY: number; zoom: number },
): void {
  const compoundPath = new Path2D();

  for (const s of members) {
    const [sx, sy] = worldToScreen(s.x, s.y, view);
    const sw = s.width * view.zoom;
    const sh = s.height * view.zoom;

    if (s.shape === 'circle') {
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      compoundPath.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    } else {
      compoundPath.rect(sx, sy, sw, sh);
    }
  }

  const color = members[0].color;
  ctx.fillStyle = color;
  ctx.fill(compoundPath);

  const allSurfaces = members.every((m) => m.surface);

  if (!allSurfaces) {
    ctx.save();
    const inverse = new Path2D();
    inverse.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
    inverse.addPath(compoundPath);
    ctx.clip(inverse, 'evenodd');
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.stroke(compoundPath);
    ctx.restore();
  }
}

export const STRUCTURE_LAYERS: RenderLayer<StructureLayerData>[] = [
  {
    id: 'structure-bodies',
    label: 'Structure Bodies',
    alwaysOn: true,
    draw(ctx, data) {
      const { renderQueue, view } = data;
      for (const item of renderQueue) {
        if (item.type === 'single') {
          drawSingleBody(ctx, item.structure, view);
        } else {
          drawGroupBody(ctx, item.members, view);
        }
      }
    },
  },

  {
    id: 'structure-walls',
    label: 'Structure Walls',
    draw(_ctx, _data) {
      // No-op placeholder. Wall drawing is inseparable from body rendering
      // for raised-bed/pot types. This layer exists as a toggle point for future separation.
    },
  },

  {
    id: 'structure-surfaces',
    label: 'Structure Surfaces',
    draw(ctx, data) {
      const { renderQueue, view } = data;
      for (const item of renderQueue) {
        const members = item.type === 'single' ? [item.structure] : item.members;
        for (const s of members) {
          if (!s.surface) continue;
          const [sx, sy] = worldToScreen(s.x, s.y, view);
          const sw = s.width * view.zoom;
          const sh = s.height * view.zoom;
          renderPatternOverlay(ctx, 'hatch', {
            x: sx, y: sy, w: sw, h: sh,
            shape: s.shape === 'circle' ? 'circle' : 'rectangle',
          });
        }
      }
    },
  },

  {
    id: 'structure-plantable-area',
    label: 'Plantable Area',
    defaultVisible: false,
    draw(ctx, data) {
      const { renderQueue, view } = data;
      for (const item of renderQueue) {
        const members = item.type === 'single' ? [item.structure] : item.members;
        for (const s of members) {
          if (s.type !== 'pot' && s.type !== 'felt-planter' && s.type !== 'raised-bed') continue;
          const [sx, sy] = worldToScreen(s.x, s.y, view);
          const sw = s.width * view.zoom;
          const sh = s.height * view.zoom;

          if (s.type === 'pot' || s.type === 'felt-planter') {
            const cx = sx + sw / 2;
            const cy = sy + sh / 2;
            const r = Math.min(sw, sh) / 2;
            const rimWidth = Math.max(1.5, s.wallThicknessFt * view.zoom);
            const innerD = (r - rimWidth) * 2;
            renderPatternOverlay(ctx, 'hatch', {
              x: cx - (r - rimWidth), y: cy - (r - rimWidth), w: innerD, h: innerD, shape: 'circle',
            }, { params: { color: '#00FF00' } });
          } else {
            // raised-bed
            const wallWidth = Math.max(2, s.wallThicknessFt * view.zoom);
            renderPatternOverlay(ctx, 'hatch', {
              x: sx + wallWidth, y: sy + wallWidth, w: sw - wallWidth * 2, h: sh - wallWidth * 2, shape: 'rectangle',
            }, { params: { color: '#00FF00' } });
          }
        }
      }
    },
  },

  {
    id: 'structure-highlights',
    label: 'Structure Highlights',
    draw(ctx, data) {
      const { renderQueue, view, highlightOpacity } = data;
      if (highlightOpacity <= 0) return;

      ctx.save();
      ctx.globalAlpha = highlightOpacity;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);

      for (const item of renderQueue) {
        if (item.type === 'single') {
          const s = item.structure;
          const [sx, sy] = worldToScreen(s.x, s.y, view);
          const sw = s.width * view.zoom;
          const sh = s.height * view.zoom;
          if (s.shape === 'circle') {
            const cx = sx + sw / 2;
            const cy = sy + sh / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.strokeRect(sx, sy, sw, sh);
          }
        } else {
          // Group: use inverse-clip trick for outer-boundary stroke only
          const members = item.members;
          const compoundPath = new Path2D();
          for (const s of members) {
            const [sx, sy] = worldToScreen(s.x, s.y, view);
            const sw = s.width * view.zoom;
            const sh = s.height * view.zoom;
            if (s.shape === 'circle') {
              const cx = sx + sw / 2;
              const cy = sy + sh / 2;
              compoundPath.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
            } else {
              compoundPath.rect(sx, sy, sw, sh);
            }
          }
          ctx.save();
          const highlightInverse = new Path2D();
          highlightInverse.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
          highlightInverse.addPath(compoundPath);
          ctx.clip(highlightInverse, 'evenodd');
          ctx.lineWidth = 4;
          ctx.stroke(compoundPath);
          ctx.restore();
        }
      }

      ctx.restore();
    },
  },

  {
    id: 'structure-labels',
    label: 'Structure Labels',
    draw(ctx, data) {
      const { renderQueue, view, labelMode, labelFontSize, debugOverlappingLabels } = data;
      if (labelMode === 'none' || labelMode === 'selection') return;

      const padX = 4;
      const padY = 1;

      ctx.save();
      ctx.font = `${labelFontSize}px sans-serif`;

      interface LabelEntry { label: string; x: number; y: number; w: number; h: number }
      const entries: LabelEntry[] = [];

      for (const item of renderQueue) {
        const members = item.type === 'single' ? [item.structure] : item.members;
        for (const s of members) {
          if (!s.label) continue;
          const [sx, sy] = worldToScreen(s.x, s.y, view);
          const sw = s.width * view.zoom;
          const sh = s.height * view.zoom;
          const cx = sx + sw / 2;
          const ly = sy + sh + 4;
          const tw = ctx.measureText(s.label).width + padX * 2;
          const th = labelFontSize + padY * 2;
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
        if (isHidden) {
          ctx.save();
          ctx.globalAlpha = 0.4;
        }
        renderLabel(ctx, e.label, e.x + e.w / 2, e.y + padY, { fontSize: labelFontSize });
        if (isHidden) ctx.restore();
      }
    },
  },
];
