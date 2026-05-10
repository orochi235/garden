import { getSlots, getGridCells, type Layout, type ParentBounds } from '../model/layout';
import type { Planting } from '../model/types';
import { getPlantableBounds } from '../model/types';
import { getCultivar } from '../model/cultivars';
import {
  computeOccupancy,
  resolveFootprint,
  cellsTouchingCircle,
  validCellsForContainer,
} from '../model/cellOccupancy';
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
  existing: Planting[],
  worldX: number,
  worldY: number,
  newCultivarId: string | undefined,
): { x: number; y: number } {
  const validCells = validCellsForContainer(bounds, cellSizeFt);
  if (validCells.length === 0) {
    return worldToLocalForParent(parent, worldX, worldY);
  }
  // Compute existing occupancy in WORLD coords.
  const existingFootprints = existing
    .map((p) => {
      const local = { cultivarId: p.cultivarId, x: p.x, y: p.y };
      return resolveFootprint(local, parent.x, parent.y);
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  const { occupied } = computeOccupancy({ bounds, cellSizeFt, plantings: existingFootprints });

  // Footprint radius for the new plant.
  const newCultivar = newCultivarId ? getCultivar(newCultivarId) : undefined;
  const newR = (newCultivar?.footprintFt ?? 0.5) / 2;

  // Sort cells by distance to drop point so we try the nearest one first.
  const candidates = [...validCells].sort((a, b) => {
    const da = (a.x - worldX) ** 2 + (a.y - worldY) ** 2;
    const db = (b.x - worldX) ** 2 + (b.y - worldY) ** 2;
    return da - db;
  });

  for (const cell of candidates) {
    const wanted = cellsTouchingCircle(cell.x, cell.y, newR, cellSizeFt, validCells);
    let clear = true;
    for (const k of wanted) {
      if (occupied.has(k)) { clear = false; break; }
    }
    if (clear) return worldToLocalForParent(parent, cell.x, cell.y);
  }

  // No valid spot — fall back to the drop position (caller may decide to
  // reject the placement).
  return worldToLocalForParent(parent, worldX, worldY);
}
