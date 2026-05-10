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
import { getCultivar } from '../../model/cultivars';
import type { PlantingPose } from './plantingMove';

type Container = (Structure | Zone) & { layout: Layout | null };

function findContainer(garden: Garden, id: string): Container | null {
  const s = garden.structures.find((x) => x.id === id);
  if (s && s.container) return s as Container;
  const z = garden.zones.find((x) => x.id === id);
  if (z) return z as Container;
  return null;
}

/** True if a circle (cx,cy,r) overlaps an axis-aligned cell whose center is (cellCx,cellCy) with half-width halfCell. */
function circleIntersectsCell(cx: number, cy: number, r: number, cellCx: number, cellCy: number, halfCell: number): boolean {
  const nearX = Math.max(cellCx - halfCell, Math.min(cx, cellCx + halfCell));
  const nearY = Math.max(cellCy - halfCell, Math.min(cy, cellCy + halfCell));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy <= r * r;
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

      // cell-grid: every valid cell is a drop target; nearestSlotSnap picks
      // the one under the cursor. We don't filter out occupied cells — the
      // conflict overlay shows red when the user drops onto another plant
      // and they decide whether to release.
      if (c.layout.type === 'cell-grid') {
        const pts = getSlots(c.layout, bounds);
        return pts.map((p) => ({ pose: { x: p.x, y: p.y }, origin: { x: p.x, y: p.y } }));
      }

      if (c.layout.type !== 'grid') {
        const pts = getSlots(c.layout, bounds);
        const occupied = new Set(
          children.filter((ch) => ch.id !== dragged.id).map((ch) => `${ch.pose.x},${ch.pose.y}`),
        );
        return pts
          .filter((p) => !occupied.has(`${p.x},${p.y}`))
          .map((p) => ({ pose: { x: p.x, y: p.y }, origin: { x: p.x, y: p.y } }));
      }

      // Grid mode: footprint-based cell occupancy.
      // A plant claims every cell whose AABB overlaps its footprint circle.
      const cells = getGridCells(c.layout.cellSizeFt, bounds);
      const halfCell = c.layout.cellSizeFt / 2;

      const occupiedKeys = new Set<string>();
      for (const child of children) {
        if (child.id === dragged.id) continue;
        const planting = garden.plantings.find((p) => p.id === child.id);
        const cultivar = planting ? getCultivar(planting.cultivarId) : null;
        const r = cultivar ? cultivar.footprintFt / 2 : halfCell;
        for (const cell of cells) {
          if (circleIntersectsCell(child.pose.x, child.pose.y, r, cell.x, cell.y, halfCell)) {
            occupiedKeys.add(`${cell.x},${cell.y}`);
          }
        }
      }

      const dragPlanting = garden.plantings.find((p) => p.id === dragged.id);
      const dragCultivar = dragPlanting ? getCultivar(dragPlanting.cultivarId) : null;
      const dragRadius = dragCultivar ? dragCultivar.footprintFt / 2 : halfCell;

      return cells
        .filter((candidate) => {
          for (const cell of cells) {
            if (
              circleIntersectsCell(candidate.x, candidate.y, dragRadius, cell.x, cell.y, halfCell) &&
              occupiedKeys.has(`${cell.x},${cell.y}`)
            ) return false;
          }
          return true;
        })
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

