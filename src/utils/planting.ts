import { getSlots, getGridCells, type Layout } from '../model/layout';
import type { Planting } from '../model/types';
import { getPlantableBounds } from '../model/types';
import { worldToLocalForParent } from './plantingPose';
import { roundToCell } from '@orochi235/weasel';

/**
 * Determine where to place a new planting inside a parent.
 * If the parent has a layout, find the next open slot.
 * Otherwise, use the raw drop position relative to the parent.
 */
export function getPlantingPosition(
  parent: { x: number; y: number; width: number; length: number; layout: Layout | null; shape?: string; wallThicknessFt?: number },
  existing: Planting[],
  worldX: number,
  worldY: number,
  cellSize: number,
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
