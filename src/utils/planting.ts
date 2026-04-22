import { computeSlots, type Arrangement } from '../model/arrangement';
import type { Planting } from '../model/types';
import { snapToGrid } from './grid';

/**
 * Determine where to place a new planting inside a parent.
 * If the parent has an arrangement (not 'free'), find the next open slot.
 * Otherwise, use the raw drop position relative to the parent.
 */
export function getPlantingPosition(
  parent: { x: number; y: number; width: number; height: number; arrangement: Arrangement | null; shape?: string },
  existing: Planting[],
  worldX: number,
  worldY: number,
  cellSize: number,
): { x: number; y: number } {
  const arrangement = parent.arrangement;
  if (!arrangement || arrangement.type === 'free') {
    return {
      x: snapToGrid(worldX - parent.x, cellSize),
      y: snapToGrid(worldY - parent.y, cellSize),
    };
  }

  const bounds = {
    x: parent.x,
    y: parent.y,
    width: parent.width,
    height: parent.height,
    shape: (parent.shape === 'circle' ? 'circle' : 'rectangle') as 'rectangle' | 'circle',
  };

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
    x: snapToGrid(worldX - parent.x, cellSize),
    y: snapToGrid(worldY - parent.y, cellSize),
  };
}
