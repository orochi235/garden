import { getCultivar } from '../../model/cultivars';
import { renderLabel } from '@orochi235/weasel';
import type { RenderLayer } from '@orochi235/weasel';
import { plantingWorldPose } from '../../utils/plantingPose';
import type { Planting, Structure, Zone } from '../../model/types';
import type { GetUi, View } from './worldLayerData';

function px(view: View, p: number): number {
  return p / Math.max(0.0001, view.scale);
}

/**
 * World-space dashed selection outlines + planting selection rings + bottom
 * label. Handles live on a separate `space: 'screen'` layer so they stay
 * sharp at any zoom (see `createSelectionHandlesLayer`).
 */
export function createSelectionOutlineLayer(
  getPlantings: () => Planting[],
  getZones: () => Zone[],
  getStructures: () => Structure[],
  getUi: GetUi,
): RenderLayer<unknown> {
  return {
    id: 'selection-outlines',
    label: 'Selection Outlines',
    alwaysOn: true,
    draw(ctx, _data, view) {
      const { selectedIds, labelFontSize } = getUi();
      if (selectedIds.length === 0) return;

      const plantings = getPlantings();
      const zones = getZones();
      const structures = getStructures();

      const parentMap = new Map<string, { x: number; y: number; width: number; height: number; shape?: string }>();
      for (const z of zones) parentMap.set(z.id, z);
      for (const s of structures) {
        if (s.container) parentMap.set(s.id, s);
      }

      const selectedPlantings = plantings.filter((p) => selectedIds.includes(p.id));
      for (const p of selectedPlantings) {
        const parent = parentMap.get(p.parentId);
        if (!parent) continue;
        const cultivar = getCultivar(p.cultivarId);
        const footprint = cultivar?.footprintFt ?? 0.5;
        const { x: wx, y: wy } = plantingWorldPose({ structures, zones }, p);
        const radius = Math.max(px(view, 3), footprint / 2);

        ctx.strokeStyle = '#5BA4CF';
        ctx.lineWidth = px(view, 2);
        ctx.setLineDash([px(view, 6), px(view, 3)]);
        ctx.beginPath();
        ctx.arc(wx, wy, radius + px(view, 2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const allObjects: Array<{ id: string; x: number; y: number; width: number; height: number; label?: string; shape?: string }> = [...structures, ...zones];
      const selected = allObjects.filter((obj) => selectedIds.includes(obj.id));

      for (const obj of selected) {
        const isCircle = obj.shape === 'circle';
        const inset = px(view, 1);

        ctx.strokeStyle = '#5BA4CF';
        ctx.lineWidth = px(view, 2);
        ctx.setLineDash([px(view, 6), px(view, 3)]);
        if (isCircle) {
          ctx.beginPath();
          ctx.ellipse(obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width / 2 + inset, obj.height / 2 + inset, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(obj.x - inset, obj.y - inset, obj.width + inset * 2, obj.height + inset * 2);
        }
        ctx.setLineDash([]);

        if (obj.label) {
          const fontPx = (labelFontSize ?? 10) / Math.max(0.0001, view.scale);
          renderLabel(ctx, obj.label, obj.x + obj.width / 2, obj.y + obj.height + px(view, 8), {
            fontSize: fontPx,
            padX: px(view, 4),
            padY: px(view, 1),
            cornerRadius: px(view, 3),
            align: 'center',
          });
        }
      }
    },
  };
}

/**
 * Faint dashed AABB around the group of any selected grouped structure.
 * Advisory-only: doesn't affect hit-testing or drag — just makes the
 * implicit group extent visible. Members are structures sharing `groupId`.
 */
export function createGroupOutlineLayer(
  getStructures: () => Structure[],
  getUi: GetUi,
): RenderLayer<unknown> {
  return {
    id: 'group-outlines',
    label: 'Group Outlines',
    alwaysOn: true,
    draw(ctx, _data, view) {
      const { selectedIds } = getUi();
      if (selectedIds.length === 0) return;

      const structures = getStructures();
      const byId = new Map(structures.map((s) => [s.id, s] as const));
      const drawnGroups = new Set<string>();

      for (const id of selectedIds) {
        const s = byId.get(id);
        if (!s || !s.groupId || drawnGroups.has(s.groupId)) continue;
        drawnGroups.add(s.groupId);
        const members = structures.filter((m) => m.groupId === s.groupId);
        if (members.length < 2) continue;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const m of members) {
          if (m.x < minX) minX = m.x;
          if (m.y < minY) minY = m.y;
          if (m.x + m.width > maxX) maxX = m.x + m.width;
          if (m.y + m.height > maxY) maxY = m.y + m.height;
        }
        const inset = px(view, 4);
        ctx.strokeStyle = 'rgba(91, 164, 207, 0.55)';
        ctx.lineWidth = px(view, 1);
        ctx.setLineDash([px(view, 3), px(view, 3)]);
        ctx.strokeRect(minX - inset, minY - inset, maxX - minX + inset * 2, maxY - minY + inset * 2);
        ctx.setLineDash([]);
      }
    },
  };
}

/**
 * Screen-space resize handles. Drawn under `space: 'screen'` so the 8px
 * squares stay sharp regardless of zoom — converts world→screen via the
 * `View` passed to draw.
 */
export function createSelectionHandlesLayer(
  getZones: () => Zone[],
  getStructures: () => Structure[],
  getUi: GetUi,
): RenderLayer<unknown> {
  return {
    id: 'selection-handles',
    label: 'Selection Handles',
    alwaysOn: true,
    space: 'screen',
    draw(ctx, _data, view) {
      const ui = getUi();
      if (ui.selectedIds.length === 0) return;

      const allObjects: Array<{ id: string; x: number; y: number; width: number; height: number }> =
        [...getStructures(), ...getZones()];
      const selected = allObjects.filter((obj) => ui.selectedIds.includes(obj.id));

      const hs = 8;
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#5BA4CF';
      ctx.lineWidth = 2;

      for (const obj of selected) {
        const sx = (obj.x - view.x) * view.scale;
        const sy = (obj.y - view.y) * view.scale;
        const sw = obj.width * view.scale;
        const sh = obj.height * view.scale;

        const points: [number, number][] = [
          [sx, sy],
          [sx + sw / 2, sy],
          [sx + sw, sy],
          [sx + sw, sy + sh / 2],
          [sx + sw, sy + sh],
          [sx + sw / 2, sy + sh],
          [sx, sy + sh],
          [sx, sy + sh / 2],
        ];
        for (const [hx, hy] of points) {
          const x = hx - hs / 2;
          const y = hy - hs / 2;
          ctx.fillRect(x, y, hs, hs);
          ctx.strokeRect(x, y, hs, hs);
        }
      }
    },
  };
}
