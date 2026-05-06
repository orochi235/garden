import { getCultivar } from '../../model/cultivars';
import { renderLabel } from '@orochi235/weasel';
import type { RenderLayer } from '@orochi235/weasel';
import { plantingWorldPose } from '../../utils/plantingPose';
import type { Planting, Structure, Zone } from '../../model/types';
import type { Seedling, Tray } from '../../model/seedStarting';
import { trayInteriorOffsetIn } from '../../model/seedStarting';
import type { GetUi, LayerDescriptor, View } from './worldLayerData';
import { descriptorById } from './worldLayerData';
import { expandToGroups } from '../../utils/groups';

/**
 * Single source of truth for selection-related layer metadata. Order here
 * matches the canonical insertion order at the canvas registration site
 * (`CanvasNewPrototype` adds group-outlines, then selection-outlines, then
 * selection-handles). The `debug-all-handles` overlay registered behind the
 * `?debug=handles` token is intentionally kept out of this list — it's a
 * debug-gated overlay, not a regular sidebar-toggleable layer.
 */
export const SELECTION_LAYER_DESCRIPTORS: readonly LayerDescriptor[] = [
  { id: 'group-outlines', label: 'Group Outlines', alwaysOn: true },
  { id: 'selection-outlines', label: 'Selection Outlines', alwaysOn: true },
  { id: 'selection-handles', label: 'Selection Handles', alwaysOn: true },
];

const SELECTION_META = descriptorById(SELECTION_LAYER_DESCRIPTORS);

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
    ...SELECTION_META['selection-outlines'],
    draw(ctx, _data, view) {
      const { selectedIds, labelFontSize } = getUi();
      if (selectedIds.length === 0) return;

      const plantings = getPlantings();
      const zones = getZones();
      const structures = getStructures();

      // Implicit drag set = group siblings of any selected grouped structure
      // that aren't themselves explicitly selected. These are dragged/cloned/
      // deleted along with the explicit selection (see expandToGroups + the
      // select tool / cycle tool / delete action wiring), so we render them
      // with a distinct subdued style so users can see "what will move/delete
      // along with my pick".
      const expanded = expandToGroups(selectedIds, structures);
      const explicitSet = new Set(selectedIds);
      const implicitSet = new Set(expanded.filter((id) => !explicitSet.has(id)));

      const parentMap = new Map<string, { x: number; y: number; width: number; length: number; shape?: string }>();
      for (const z of zones) parentMap.set(z.id, z);
      for (const s of structures) {
        if (s.container) parentMap.set(s.id, s);
      }

      // Plantings are not group-aware (groups only apply to structures), so
      // implicitSet never contains planting ids; only the explicit set draws.
      const selectedPlantings = plantings.filter((p) => explicitSet.has(p.id));
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

      const allObjects: Array<{ id: string; x: number; y: number; width: number; length: number; label?: string; shape?: string }> = [...structures, ...zones];

      // Pass 1 — implicit (group-sibling) outlines. Solid stroke at 0.6 alpha
      // distinguishes them from the explicit dashed-100% outlines without
      // adding a competing color.
      const implicitObjs = allObjects.filter((obj) => implicitSet.has(obj.id));
      if (implicitObjs.length > 0) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        for (const obj of implicitObjs) {
          const isCircle = obj.shape === 'circle';
          const inset = px(view, 1);
          ctx.strokeStyle = '#5BA4CF';
          ctx.lineWidth = px(view, 2);
          ctx.setLineDash([]);
          if (isCircle) {
            ctx.beginPath();
            ctx.ellipse(obj.x + obj.width / 2, obj.y + obj.length / 2, obj.width / 2 + inset, obj.length / 2 + inset, 0, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.strokeRect(obj.x - inset, obj.y - inset, obj.width + inset * 2, obj.length + inset * 2);
          }
        }
        ctx.restore();
      }

      // Pass 2 — explicit (UI-selected) outlines. Original dashed style.
      const selected = allObjects.filter((obj) => explicitSet.has(obj.id));
      for (const obj of selected) {
        const isCircle = obj.shape === 'circle';
        const inset = px(view, 1);

        ctx.strokeStyle = '#5BA4CF';
        ctx.lineWidth = px(view, 2);
        ctx.setLineDash([px(view, 6), px(view, 3)]);
        if (isCircle) {
          ctx.beginPath();
          ctx.ellipse(obj.x + obj.width / 2, obj.y + obj.length / 2, obj.width / 2 + inset, obj.length / 2 + inset, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(obj.x - inset, obj.y - inset, obj.width + inset * 2, obj.length + inset * 2);
        }
        ctx.setLineDash([]);

        if (obj.label) {
          const fontPx = (labelFontSize ?? 10) / Math.max(0.0001, view.scale);
          renderLabel(ctx, obj.label, obj.x + obj.width / 2, obj.y + obj.length + px(view, 8), {
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
    ...SELECTION_META['group-outlines'],
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
          if (m.y + m.length > maxY) maxY = m.y + m.length;
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
    ...SELECTION_META['selection-handles'],
    space: 'screen',
    draw(ctx, _data, view) {
      const ui = getUi();
      if (ui.selectedIds.length === 0) return;

      const allObjects: Array<{ id: string; x: number; y: number; width: number; length: number }> =
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
        const sh = obj.length * view.scale;

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

/**
 * Debug overlay (`?debug=handles`): draws muted, lower-opacity handles for
 * EVERY selectable entity in the scene, not just the currently selected ones.
 * Visually distinct from real selection handles (smaller, neutral-color,
 * partially transparent) so it's hard to confuse with an actual selection.
 *
 * Garden mode: structures + zones get 8-corner rect handles; plantings get a
 * single handle dot at their world pose. Seed-starting mode: seedlings get a
 * single handle dot at the centre of their cell.
 *
 * Implementation note (Phase 5 deferral): rather than parameterise
 * `createSelectionHandlesLayer` with an "iterate-all" flag, this is its own
 * sibling layer registered behind the debug-token gate. Keeps the hot path
 * (real selection rendering) untouched and lets the all-handles overlay use
 * a smaller / neutral style without conditional branches.
 */
export interface AllHandlesGetters {
  getStructures?: () => Structure[];
  getZones?: () => Zone[];
  getPlantings?: () => Planting[];
  getTrays?: () => Tray[];
  getSeedlings?: () => Seedling[];
}

export function createAllHandlesLayer(getters: AllHandlesGetters): RenderLayer<unknown> {
  return {
    id: 'debug-all-handles',
    label: 'Debug: All Handles',
    alwaysOn: true,
    space: 'screen',
    draw(ctx, _data, view) {
      const hs = 5;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 1;

      const drawRectHandles = (wx: number, wy: number, ww: number, wh: number) => {
        const sx = (wx - view.x) * view.scale;
        const sy = (wy - view.y) * view.scale;
        const sw = ww * view.scale;
        const sh = wh * view.scale;
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
      };

      const drawDot = (wx: number, wy: number) => {
        const sx = (wx - view.x) * view.scale;
        const sy = (wy - view.y) * view.scale;
        ctx.fillRect(sx - hs / 2, sy - hs / 2, hs, hs);
        ctx.strokeRect(sx - hs / 2, sy - hs / 2, hs, hs);
      };

      const structures = getters.getStructures?.() ?? [];
      const zones = getters.getZones?.() ?? [];
      for (const s of structures) drawRectHandles(s.x, s.y, s.width, s.length);
      for (const z of zones) drawRectHandles(z.x, z.y, z.width, z.length);

      const plantings = getters.getPlantings?.() ?? [];
      if (plantings.length > 0) {
        for (const p of plantings) {
          const { x, y } = plantingWorldPose({ structures, zones }, p);
          drawDot(x, y);
        }
      }

      const trays = getters.getTrays?.() ?? [];
      const seedlings = getters.getSeedlings?.() ?? [];
      if (trays.length > 0 && seedlings.length > 0) {
        const trayById = new Map(trays.map((t) => [t.id, t] as const));
        for (const sd of seedlings) {
          if (!sd.trayId || sd.row == null || sd.col == null) continue;
          const tray = trayById.get(sd.trayId);
          if (!tray) continue;
          const off = trayInteriorOffsetIn(tray);
          const cx = off.x + (sd.col + 0.5) * tray.cellPitchIn;
          const cy = off.y + (sd.row + 0.5) * tray.cellPitchIn;
          drawDot(cx, cy);
        }
      }

      ctx.restore();
    },
  };
}
