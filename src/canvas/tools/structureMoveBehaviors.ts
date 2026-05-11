import type { MoveBehavior } from '@orochi235/weasel';
import type { GardenSceneAdapter, ScenePose, SceneNode } from '../adapters/gardenScene';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

/**
 * Compute the union AABB (in world coordinates) of every dragged id, applying
 * an x/y delta against each id's *origin* pose. The primary id's pose comes
 * from `proposedPrimary` (already shaped by upstream behaviors like
 * `snapStructureZoneToGrid`); secondaries inherit the same delta from origin.
 *
 * Plantings and unknown ids contribute nothing — clamp/clash logic only
 * applies to structures and zones.
 */
function unionDraggedAABB(
  adapter: GardenSceneAdapter,
  draggedIds: string[],
  origin: Map<string, ScenePose>,
  proposedPrimary: ScenePose,
): { x: number; y: number; width: number; height: number } | null {
  const primaryId = draggedIds[0];
  const primaryOrigin = origin.get(primaryId);
  if (!primaryOrigin) return null;
  const dx = proposedPrimary.x - primaryOrigin.x;
  const dy = proposedPrimary.y - primaryOrigin.y;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of draggedIds) {
    const node = adapter.getNode(id) as SceneNode | undefined;
    if (!node) continue;
    if (node.kind !== 'structure' && node.kind !== 'zone') continue;
    const o = origin.get(id);
    if (!o) continue;
    const w = node.data.width;
    const h = node.data.length;
    const x = o.x + dx;
    const y = o.y + dy;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Hard-clamp the dragging set's union AABB to garden bounds
 * `[0, widthFt] × [0, lengthFt]`. The kit's `MoveBehavior.onMove` only runs
 * on the primary id, so we clamp the *delta* applied to the primary; the kit
 * applies the same translation to secondaries (group-drag), so the same
 * clamp transitively keeps secondaries in bounds.
 *
 * Plantings are exempt: their pose is decided by container layout strategies
 * and structure dimensions, not free-space drag.
 *
 * If the AABB is larger than the garden in either axis, we clamp to keep at
 * least the top-left corner inside (overflow is permitted in that degenerate
 * case rather than locking the drag entirely).
 */
export function clampStructureZoneToGardenBounds(
  adapter: GardenSceneAdapter,
): MoveBehavior<ScenePose> {
  return {
    onMove(ctx, proposed) {
      const node = adapter.getNode(ctx.draggedIds[0]) as SceneNode | undefined;
      if (!node) return;
      if (node.kind !== 'structure' && node.kind !== 'zone') return;

      const garden = useGardenStore.getState().garden;
      const aabb = unionDraggedAABB(adapter, ctx.draggedIds, ctx.origin, proposed);
      if (!aabb) return;

      let shiftX = 0;
      let shiftY = 0;
      if (aabb.x < 0) shiftX = -aabb.x;
      else if (aabb.x + aabb.width > garden.widthFt) {
        shiftX = garden.widthFt - (aabb.x + aabb.width);
        // If the AABB is wider than the garden, prefer left-edge alignment.
        if (aabb.x + shiftX < 0) shiftX = -aabb.x;
      }
      if (aabb.y < 0) shiftY = -aabb.y;
      else if (aabb.y + aabb.height > garden.lengthFt) {
        shiftY = garden.lengthFt - (aabb.y + aabb.height);
        if (aabb.y + shiftY < 0) shiftY = -aabb.y;
      }

      if (shiftX === 0 && shiftY === 0) return;
      return { pose: { x: proposed.x + shiftX, y: proposed.y + shiftY } };
    },
  };
}

/** AABB intersection in world coordinates. Touching edges do not count. */
function aabbIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Detect structure-on-structure overlap during a drag and publish the clashing
 * non-dragging structure ids to `uiStore.dragClashIds`. The clash is a
 * non-blocking warning: the drop still commits even when ids are present.
 *
 * Zones are intentionally excluded — gardens can layer zones over structures
 * and over each other freely.
 *
 * Computed against the proposed pose for the primary id (post-clamp,
 * post-snap), with secondaries sharing the same delta.
 */
export function detectStructureClash(
  adapter: GardenSceneAdapter,
): MoveBehavior<ScenePose> {
  return {
    onMove(ctx, proposed) {
      const primary = adapter.getNode(ctx.draggedIds[0]) as SceneNode | undefined;
      if (!primary || primary.kind !== 'structure') {
        // Non-structure primary drags don't generate structure clashes.
        if (useUiStore.getState().dragClashIds.length > 0) {
          useUiStore.getState().setDragClashIds([]);
        }
        return;
      }

      const garden = useGardenStore.getState().garden;
      const draggedSet = new Set(ctx.draggedIds);
      const primaryOrigin = ctx.origin.get(ctx.draggedIds[0]);
      if (!primaryOrigin) return;
      const dx = proposed.x - primaryOrigin.x;
      const dy = proposed.y - primaryOrigin.y;

      const draggedRects: { x: number; y: number; width: number; height: number }[] = [];
      for (const id of ctx.draggedIds) {
        const node = adapter.getNode(id) as SceneNode | undefined;
        if (!node || node.kind !== 'structure') continue;
        const o = ctx.origin.get(id);
        if (!o) continue;
        draggedRects.push({
          x: o.x + dx,
          y: o.y + dy,
          width: node.data.width,
          height: node.data.length,
        });
      }

      const clashes: string[] = [];
      for (const s of garden.structures) {
        if (draggedSet.has(s.id)) continue;
        const sRect = { x: s.x, y: s.y, width: s.width, height: s.length };
        for (const dRect of draggedRects) {
          if (aabbIntersect(dRect, sRect)) {
            clashes.push(s.id);
            break;
          }
        }
      }

      const cur = useUiStore.getState().dragClashIds;
      const same = cur.length === clashes.length && cur.every((id, i) => id === clashes[i]);
      if (!same) useUiStore.getState().setDragClashIds(clashes);
    },
    onEnd() {
      if (useUiStore.getState().dragClashIds.length > 0) {
        useUiStore.getState().setDragClashIds([]);
      }
    },
  };
}
