/**
 * `plantingLayoutFor` returns a `LayoutStrategy<PlantingPose>` for a given
 * container id (structure or zone). Weasel's `useMove` calls this through
 * `MoveAdapter.getLayout`; the strategy drives drop-targeting, snap, and the
 * commit ops (reparent + transform).
 *
 * Strategies bridge eric's `Layout` model to weasel: `getSlots`/`getGridCells`
 * are the authority on where children go, this file just shapes that into the
 * `DropTarget` / `LayoutStrategy` contract weasel expects.
 */
import {
  createReparentOp,
  createTransformOp,
  type LayoutStrategy,
  type DropTarget,
  type LayoutSnap,
} from '@orochi235/weasel';
import type { Op } from '@orochi235/weasel';
import { getSlots, getGridCells, type Layout } from '../../model/layout';
import { getPlantableBounds } from '../../model/types';
import type { Garden, Structure, Zone } from '../../model/types';
import type { PlantingPose } from './plantingMove';

type Container = (Structure | Zone) & { layout: Layout | null };

function findContainer(garden: Garden, id: string): Container | null {
  const s = garden.structures.find((x) => x.id === id);
  if (s && s.container) return s as Container;
  const z = garden.zones.find((x) => x.id === id);
  if (z) return z as Container;
  return null;
}

/** Pick the nearest drop target by Euclidean distance from the pointer. */
function nearestSlotSnap(): LayoutSnap<PlantingPose> {
  return {
    pickTarget(targets, pointer) {
      let best: DropTarget<PlantingPose> | null = null;
      let bestDist = Infinity;
      for (const t of targets) {
        const dx = t.origin.x - pointer.x;
        const dy = t.origin.y - pointer.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; best = t; }
      }
      return best;
    },
  };
}

export function plantingLayoutFor(
  getGarden: () => Garden,
  containerId: string,
): LayoutStrategy<PlantingPose> | null {
  const probe = findContainer(getGarden(), containerId);
  if (!probe || !probe.layout) return null;

  const snap = nearestSlotSnap();

  return {
    snap,

    contains(_pose, point) {
      // Use live garden state — the pose passed in is the dragged-pose origin
      // when the gesture probes; eric stores world geometry on the container.
      const c = findContainer(getGarden(), containerId);
      if (!c) return false;
      const shape = (c as Structure).shape ?? 'rectangle';
      if (shape === 'circle') {
        const cx = c.x + c.width / 2;
        const cy = c.y + c.length / 2;
        const rx = c.width / 2;
        const ry = c.length / 2;
        if (rx === 0 || ry === 0) return false;
        return ((point.x - cx) ** 2) / (rx * rx) + ((point.y - cy) ** 2) / (ry * ry) <= 1;
      }
      return point.x >= c.x && point.x <= c.x + c.width
        && point.y >= c.y && point.y <= c.y + c.length;
    },

    getChildPositions(_container, children) {
      const out = new Map<string, PlantingPose>();
      for (const c of children) out.set(c.id, c.pose);
      return out;
    },

    getDropTargets(_container, children, dragged) {
      const garden = getGarden();
      const c = findContainer(garden, containerId);
      if (!c || !c.layout) return [];

      const bounds = getPlantableBounds(c);
      const occupied = new Set(
        children.filter((ch) => ch.id !== dragged.id).map((ch) => `${ch.pose.x},${ch.pose.y}`),
      );

      let pts: { x: number; y: number }[];
      if (c.layout.type === 'grid') {
        pts = getGridCells(c.layout.cellSizeFt, bounds);
      } else {
        pts = getSlots(c.layout, bounds);
      }

      return pts
        .filter((p) => !occupied.has(`${p.x},${p.y}`))
        .map((p) => ({ pose: { x: p.x, y: p.y }, origin: { x: p.x, y: p.y } }));
    },

    reflowFor() {
      return new Map();
    },

    commitDrop(_container, _children, dragged, target) {
      const ops: Op[] = [];
      if (target === null) return ops;
      if (dragged.sourceContainerId !== containerId) {
        ops.push(createReparentOp({
          id: dragged.id,
          fromParentId: dragged.sourceContainerId,
          toParentId: containerId,
          label: 'Drop into container',
        }));
      }
      ops.push(createTransformOp<PlantingPose>({
        id: dragged.id,
        from: dragged.originPose,
        to: target.pose,
        label: 'Drop into container',
      }));
      return ops;
    },
  };
}

/** Returns a `getLayout` callback suitable for `MoveAdapter.getLayout`. */
export function createPlantingGetLayout(getGarden: () => Garden): (id: string) => LayoutStrategy<PlantingPose> | null {
  return (id) => plantingLayoutFor(getGarden, id);
}

