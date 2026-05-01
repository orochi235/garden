import { computeSlots, type Arrangement } from '../model/arrangement';
import type { Planting } from '../model/types';
import { getPlantableBounds } from '../model/types';
import { roundToCell } from '@orochi235/weasel';

/**
 * Determine where to place a new planting inside a parent.
 * If the parent has an arrangement (not 'free'), find the next open slot.
 * Otherwise, use the raw drop position relative to the parent.
 */
export function getPlantingPosition(
  parent: { x: number; y: number; width: number; height: number; arrangement: Arrangement | null; shape?: string; wallThicknessFt?: number },
  existing: Planting[],
  worldX: number,
  worldY: number,
  cellSize: number,
): { x: number; y: number } {
  const arrangement = parent.arrangement;
  if (!arrangement || arrangement.type === 'free') {
    return {
      x: roundToCell(worldX - parent.x, cellSize),
      y: roundToCell(worldY - parent.y, cellSize),
    };
  }

  const bounds = getPlantableBounds(parent);

  const slots = computeSlots(arrangement, bounds);
  const occupiedSet = new Set(existing.map(p => `${p.x},${p.y}`));

  // Find first open slot
  for (const slot of slots) {
    const relX = slot.x - parent.x;
    const relY = slot.y - parent.y;
    if (!occupiedSet.has(`${relX},${relY}`)) {
      return { x: relX, y: relY };
    }
  }

  // All slots full — place at drop position
  return {
    x: roundToCell(worldX - parent.x, cellSize),
    y: roundToCell(worldY - parent.y, cellSize),
  };
}
