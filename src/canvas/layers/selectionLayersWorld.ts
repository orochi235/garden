import {
  type RenderLayer,
  PathBuilder,
  rectPath,
} from '@orochi235/weasel';
import { type DrawCommand, viewToMat3 } from '../util/weaselLocal';
import type { Dims, View } from '@orochi235/weasel';
import { getCultivar } from '../../model/cultivars';
import { plantingWorldPose } from '../../utils/plantingPose';
import type { Planting, Structure, Zone } from '../../model/types';
import type { Seedling, Tray } from '../../model/seedStarting';
import { trayInteriorOffsetIn } from '../../model/seedStarting';
import type { GetUi, LayerDescriptor } from './worldLayerData';
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

/** Approximate a full circle as 4 cubic-bezier segments. */
function circlePath(cx: number, cy: number, r: number): ReturnType<PathBuilder['build']> {
  const k = 0.5522847498 * r;
  return new PathBuilder()
    .moveTo(cx, cy - r)
    .curveTo(cx + r * k, cy - r, cx + r, cy - r * k, cx + r, cy)
    .curveTo(cx + r, cy + r * k, cx + r * k, cy + r, cx, cy + r)
    .curveTo(cx - r * k, cy + r, cx - r, cy + r * k, cx - r, cy)
    .curveTo(cx - r, cy - r * k, cx - r * k, cy - r, cx, cy - r)
    .close()
    .build();
}

/** Approximate a full ellipse as 4 cubic-bezier segments. */
function ellipsePath(
  cx: number, cy: number, rx: number, ry: number,
): ReturnType<PathBuilder['build']> {
  const kx = 0.5522847498 * rx;
  const ky = 0.5522847498 * ry;
  return new PathBuilder()
    .moveTo(cx, cy - ry)
    .curveTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy)
    .curveTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry)
    .curveTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy)
    .curveTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry)
    .close()
    .build();
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
    draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
      const { selectedIds, labelFontSize } = getUi();
      if (selectedIds.length === 0) return [];

      const plantings = getPlantings();
      const zones = getZones();
      const structures = getStructures();

      // Implicit drag set = group siblings of any selected grouped structure
      const expanded = expandToGroups(selectedIds, structures);
      const explicitSet = new Set(selectedIds);
      const implicitSet = new Set(expanded.filter((id) => !explicitSet.has(id)));

      const parentMap = new Map<string, { x: number; y: number; width: number; length: number; shape?: string }>();
      for (const z of zones) parentMap.set(z.id, z);
      for (const s of structures) {
        if (s.container) parentMap.set(s.id, s);
      }

      const children: DrawCommand[] = [];
      const lw = px(view, 2);
      const selColor = '#5BA4CF';
      const dash = [px(view, 6), px(view, 3)];

      // Planting selection rings
      const selectedPlantings = plantings.filter((p) => explicitSet.has(p.id));
      for (const p of selectedPlantings) {
        const parent = parentMap.get(p.parentId);
        if (!parent) continue;
        const cultivar = getCultivar(p.cultivarId);
        const footprint = cultivar?.footprintFt ?? 0.5;
        const { x: wx, y: wy } = plantingWorldPose({ structures, zones }, p);
        const radius = Math.max(px(view, 3), footprint / 2);
        children.push({
          kind: 'path',
          path: circlePath(wx, wy, radius + px(view, 2)),
          stroke: { paint: { fill: 'solid', color: selColor }, width: lw, dash },
        });
      }

      const allObjects: Array<{ id: string; x: number; y: number; width: number; length: number; label?: string; shape?: string }> = [...structures, ...zones];

      // Pass 1 — implicit (group-sibling) outlines: solid stroke at 0.6 alpha
      const implicitObjs = allObjects.filter((obj) => implicitSet.has(obj.id));
      if (implicitObjs.length > 0) {
        const implicitChildren: DrawCommand[] = implicitObjs.map((obj) => {
          const isCircle = obj.shape === 'circle';
          const inset = px(view, 1);
          const path = isCircle
            ? ellipsePath(
                obj.x + obj.width / 2, obj.y + obj.length / 2,
                obj.width / 2 + inset, obj.length / 2 + inset,
              )
            : rectPath(obj.x - inset, obj.y - inset, obj.width + inset * 2, obj.length + inset * 2);
          return {
            kind: 'path' as const,
            path,
            stroke: { paint: { fill: 'solid' as const, color: selColor }, width: lw },
          };
        });
        children.push({ kind: 'group', alpha: 0.6, children: implicitChildren });
      }

      // Pass 2 — explicit (UI-selected) outlines: dashed 100% alpha
      const selected = allObjects.filter((obj) => explicitSet.has(obj.id));
      for (const obj of selected) {
        const isCircle = obj.shape === 'circle';
        const inset = px(view, 1);
        const path = isCircle
          ? ellipsePath(
              obj.x + obj.width / 2, obj.y + obj.length / 2,
              obj.width / 2 + inset, obj.length / 2 + inset,
            )
          : rectPath(obj.x - inset, obj.y - inset, obj.width + inset * 2, obj.length + inset * 2);
        children.push({
          kind: 'path',
          path,
          stroke: { paint: { fill: 'solid', color: selColor }, width: lw, dash },
        });

        // Flagged: text commands require registerFont() wired at app boot.
        if (obj.label) {
          const fontPx = (labelFontSize ?? 10) / Math.max(0.0001, view.scale);
          children.push({
            kind: 'text',
            x: obj.x + obj.width / 2,
            y: obj.y + obj.length + px(view, 8),
            text: obj.label,
            style: {
              fontSize: fontPx,
              align: 'center' as const,
              fill: { fill: 'solid' as const, color: '#ffffff' },
            },
          });
        }
      }

      return [{ kind: 'group', transform: viewToMat3(view), children }];
    },
  };
}

/**
 * Faint dashed AABB around the group of any selected grouped structure.
 * Advisory-only: doesn't affect hit-testing or drag.
 */
export function createGroupOutlineLayer(
  getStructures: () => Structure[],
  getUi: GetUi,
): RenderLayer<unknown> {
  return {
    ...SELECTION_META['group-outlines'],
    draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
      const { selectedIds } = getUi();
      if (selectedIds.length === 0) return [];

      const structures = getStructures();
      const byId = new Map(structures.map((s) => [s.id, s] as const));
      const drawnGroups = new Set<string>();

      const children: DrawCommand[] = [];
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
        children.push({
          kind: 'path',
          path: rectPath(minX - inset, minY - inset, maxX - minX + inset * 2, maxY - minY + inset * 2),
          stroke: {
            paint: { fill: 'solid', color: 'rgba(91, 164, 207, 0.55)' },
            width: px(view, 1),
            dash: [px(view, 3), px(view, 3)],
          },
        });
      }

      return [{ kind: 'group', transform: viewToMat3(view), children }];
    },
  };
}

/**
 * Screen-space resize handles. Drawn under `space: 'screen'` so the 8px
 * squares stay sharp regardless of zoom — uses world→screen conversion via
 * the View passed to draw.
 */
export function createSelectionHandlesLayer(
  getZones: () => Zone[],
  getStructures: () => Structure[],
  getUi: GetUi,
): RenderLayer<unknown> {
  return {
    ...SELECTION_META['selection-handles'],
    space: 'screen',
    draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
      const ui = getUi();
      if (ui.selectedIds.length === 0) return [];

      const allObjects: Array<{ id: string; x: number; y: number; width: number; length: number }> =
        [...getStructures(), ...getZones()];
      const selected = allObjects.filter((obj) => ui.selectedIds.includes(obj.id));

      const hs = 8;
      const children: DrawCommand[] = [];
      for (const obj of selected) {
        const sx = (obj.x - view.x) * view.scale;
        const sy = (obj.y - view.y) * view.scale;
        const sw = obj.width * view.scale;
        const sh = obj.length * view.scale;

        const corners: [number, number][] = [
          [sx, sy],
          [sx + sw / 2, sy],
          [sx + sw, sy],
          [sx + sw, sy + sh / 2],
          [sx + sw, sy + sh],
          [sx + sw / 2, sy + sh],
          [sx, sy + sh],
          [sx, sy + sh / 2],
        ];
        for (const [hx, hy] of corners) {
          const x = hx - hs / 2;
          const y = hy - hs / 2;
          children.push({
            kind: 'path',
            path: rectPath(x, y, hs, hs),
            fill: { fill: 'solid', color: '#FFFFFF' },
            stroke: { paint: { fill: 'solid', color: '#5BA4CF' }, width: 2 },
          });
        }
      }
      return children;
    },
  };
}

/**
 * Debug overlay (`?debug=handles`): draws muted, lower-opacity handles for
 * EVERY selectable entity in the scene, not just the currently selected ones.
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
    draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
      const hs = 5;
      const fillColor = '#FFFFFF';
      const strokeColor = '#888888';

      const rectHandles = (wx: number, wy: number, ww: number, wh: number): DrawCommand[] => {
        const sx = (wx - view.x) * view.scale;
        const sy = (wy - view.y) * view.scale;
        const sw = ww * view.scale;
        const sh = wh * view.scale;
        const corners: [number, number][] = [
          [sx, sy], [sx + sw / 2, sy], [sx + sw, sy],
          [sx + sw, sy + sh / 2], [sx + sw, sy + sh],
          [sx + sw / 2, sy + sh], [sx, sy + sh], [sx, sy + sh / 2],
        ];
        return corners.map(([hx, hy]) => ({
          kind: 'path' as const,
          path: rectPath(hx - hs / 2, hy - hs / 2, hs, hs),
          fill: { fill: 'solid' as const, color: fillColor },
          stroke: { paint: { fill: 'solid' as const, color: strokeColor }, width: 1 },
        }));
      };

      const dotHandle = (wx: number, wy: number): DrawCommand => {
        const sx = (wx - view.x) * view.scale;
        const sy = (wy - view.y) * view.scale;
        return {
          kind: 'path',
          path: rectPath(sx - hs / 2, sy - hs / 2, hs, hs),
          fill: { fill: 'solid', color: fillColor },
          stroke: { paint: { fill: 'solid', color: strokeColor }, width: 1 },
        };
      };

      const innerCmds: DrawCommand[] = [];
      const structures = getters.getStructures?.() ?? [];
      const zones = getters.getZones?.() ?? [];
      for (const s of structures) innerCmds.push(...rectHandles(s.x, s.y, s.width, s.length));
      for (const z of zones) innerCmds.push(...rectHandles(z.x, z.y, z.width, z.length));

      const plantings = getters.getPlantings?.() ?? [];
      if (plantings.length > 0) {
        for (const p of plantings) {
          const { x, y } = plantingWorldPose({ structures, zones }, p);
          innerCmds.push(dotHandle(x, y));
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
          innerCmds.push(dotHandle(cx, cy));
        }
      }

      if (innerCmds.length === 0) return [];
      return [{ kind: 'group', alpha: 0.45, children: innerCmds }];
    },
  };
}
