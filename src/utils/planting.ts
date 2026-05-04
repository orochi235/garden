import { computeSlots, type Arrangement } from '../model/arrangement';
import type { Planting } from '../model/types';
import { getPlantableBounds } from '../model/types';
import { worldToLocalForParent } from './plantingPose';
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
    const local = worldToLocalForParent(parent, worldX, worldY);
    return {
      x: roundToCell(local.x, cellSize),
      y: roundToCell(local.y, cellSize),
    };
  }

  const bounds = getPlantableBounds(parent);

  const slots = computeSlots(arrangement, bounds);
  const occupiedSet = new Set(existing.map(p => `${p.x},${p.y}`));

  // Find first open slot
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
