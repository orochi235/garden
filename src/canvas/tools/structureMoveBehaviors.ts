import type { MoveBehavior } from '@weasel-js/core';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { GardenSceneAdapter, SceneNode, ScenePose } from '../adapters/gardenScene';

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Each dragged structure (and zone, with `includeZones`) as a world rect after
 * translating its origin by `(dx, dy)`. Plantings follow their container's
 * layout, so they never contribute.
 */
function draggedRects(
  adapter: GardenSceneAdapter,
  draggedIds: string[],
  origin: Map<string, ScenePose>,
  dx: number,
  dy: number,
  includeZones: boolean,
): Rect[] {
  const rects: Rect[] = [];
  for (const id of draggedIds) {
    const node = adapter.getNode(id) as SceneNode | undefined;
    if (!node) continue;
    if (node.kind !== 'structure' && !(includeZones && node.kind === 'zone')) continue;
    const o = origin.get(id);
    if (!o) continue;
    rects.push({ x: o.x + dx, y: o.y + dy, width: node.data.width, height: node.data.length });
  }
  return rects;
}

/**
 * Hard-clamp the union of every dragged structure and zone to garden bounds
 * `[0, widthFt] × [0, lengthFt]` by adjusting the group's shared translation.
 *
 * If the union is larger than the garden in either axis, its top-left corner
 * stays inside and the rest overflows, rather than locking the drag.
 */
export function clampStructureZoneToGardenBounds(
  adapter: GardenSceneAdapter,
): MoveBehavior<ScenePose> {
  return {
    onMove(ctx, proposed) {
      if (proposed.kind !== 'translate') return;
      const rects = draggedRects(
        adapter,
        ctx.draggedIds,
        ctx.origin,
        proposed.dx,
        proposed.dy,
        true,
      );
      if (rects.length === 0) return;
      const minX = Math.min(...rects.map((r) => r.x));
      const minY = Math.min(...rects.map((r) => r.y));
      const maxX = Math.max(...rects.map((r) => r.x + r.width));
      const maxY = Math.max(...rects.map((r) => r.y + r.height));
      const garden = useGardenStore.getState().garden;

      const shift = (min: number, max: number, limit: number) => {
        if (min < 0) return -min;
        if (max > limit) return Math.max(limit - max, -min);
        return 0;
      };
      const shiftX = shift(minX, maxX, garden.widthFt);
      const shiftY = shift(minY, maxY, garden.lengthFt);
      if (shiftX === 0 && shiftY === 0) return;
      return {
        transform: { kind: 'translate', dx: proposed.dx + shiftX, dy: proposed.dy + shiftY },
      };
    },
  };
}

/** AABB intersection in world coordinates. Touching edges do not count. */
function aabbIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Detect structure-on-structure overlap during a drag and publish the clashing
 * non-dragging structure ids to `uiStore.dragClashIds`. The clash is a
 * non-blocking warning: the drop still commits even when ids are present.
 *
 * Zones are intentionally excluded — gardens can layer zones over structures
 * and over each other freely.
 */
export function detectStructureClash(adapter: GardenSceneAdapter): MoveBehavior<ScenePose> {
  const publish = (clashes: string[]) => {
    const cur = useUiStore.getState().dragClashIds;
    const same = cur.length === clashes.length && cur.every((id, i) => id === clashes[i]);
    if (!same) useUiStore.getState().setDragClashIds(clashes);
  };
  return {
    onMove(ctx, proposed) {
      if (proposed.kind !== 'translate') return;
      const rects = draggedRects(
        adapter,
        ctx.draggedIds,
        ctx.origin,
        proposed.dx,
        proposed.dy,
        false,
      );
      const draggedSet = new Set(ctx.draggedIds);
      const clashes: string[] = [];
      if (rects.length > 0) {
        for (const s of useGardenStore.getState().garden.structures) {
          if (draggedSet.has(s.id)) continue;
          const sRect = { x: s.x, y: s.y, width: s.width, height: s.length };
          if (rects.some((r) => aabbIntersect(r, sRect))) clashes.push(s.id);
        }
      }
      publish(clashes);
    },
    onEnd() {
      publish([]);
    },
  };
}
