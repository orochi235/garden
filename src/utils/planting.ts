import { getSlots, getGridCells, type Layout, type ParentBounds } from '../model/layout';
import type { Planting } from '../model/types';
import { getPlantableBounds } from '../model/types';
import { validCellsForContainer } from '../model/cellOccupancy';
import { worldToLocalForParent } from './plantingPose';
import { roundToCell } from '@orochi235/weasel';

/**
 * Determine where to place a new planting inside a parent.
 *
 * - `cell-grid` layout: snap to the nearest cell center; if that cell's
 *   footprint would touch any cell already occupied by an existing planting,
 *   walk outward in increasing-distance order until we find a valid spot.
 * - `grid` (legacy) / `single` / `snap-points`: walk the layout's slots and
 *   take the first one not already at exactly the same position.
 * - No layout: snap to `cellSize` grid.
 */
export function getPlantingPosition(
  parent: { x: number; y: number; width: number; length: number; layout: Layout | null; shape?: string; wallThicknessFt?: number },
  existing: Planting[],
  worldX: number,
  worldY: number,
  cellSize: number,
  newCultivarId?: string,
): { x: number; y: number } {
  const layout = parent.layout;
  if (!layout) {
    const local = worldToLocalForParent(parent, worldX, worldY);
    return {
      x: roundToCell(local.x, cellSize),
      y: roundToCell(local.y, cellSize),
    };
  }

  const bounds = getPlantableBounds(parent);

  if (layout.type === 'cell-grid') {
    return placeOnCellGrid(parent, bounds, layout.cellSizeFt, existing, worldX, worldY, newCultivarId);
  }

  const slots = layout.type === 'grid'
    ? getGridCells(layout.cellSizeFt, bounds)
    : getSlots(layout, bounds);
  const occupiedSet = new Set(existing.map(p => `${p.x},${p.y}`));

  for (const slot of slots) {
    const local = worldToLocalForParent(parent, slot.x, slot.y);
    if (!occupiedSet.has(`${local.x},${local.y}`)) {
      return local;
    }
  }

  // All slots full — place at drop position
  const local = worldToLocalForParent(parent, worldX, worldY);
  return {
    x: roundToCell(local.x, cellSize),
    y: roundToCell(local.y, cellSize),
  };
}

function placeOnCellGrid(
  parent: { x: number; y: number; width: number; length: number; shape?: string },
  bounds: ParentBounds,
  cellSizeFt: number,
  _existing: Planting[],
  worldX: number,
  worldY: number,
  _newCultivarId: string | undefined,
): { x: number; y: number } {
  // Always snap to the nearest valid cell under the cursor — no "walk to
  // find a free spot" detour. If the resulting position overlaps an existing
  // plant the conflict overlay will show red; the user decides whether to
  // commit. This is what "drop where I want" means.
  const validCells = validCellsForContainer(bounds, cellSizeFt);
  if (validCells.length === 0) {
    return worldToLocalForParent(parent, worldX, worldY);
  }
  let best = validCells[0];
  let bestDist = Infinity;
  for (const cell of validCells) {
    const d = (cell.x - worldX) ** 2 + (cell.y - worldY) ** 2;
    if (d < bestDist) { bestDist = d; best = cell; }
  }
  return worldToLocalForParent(parent, best.x, best.y);
}
