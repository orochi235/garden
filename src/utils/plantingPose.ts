import type { Garden, Planting } from '../model/types';

export interface WorldPose { x: number; y: number }

/** Look up a planting's parent (structure or zone) by id. */
export function getPlantingParent(
  garden: Pick<Garden, 'structures' | 'zones'>,
  parentId: string,
): { id: string; x: number; y: number } | undefined {
  return garden.structures.find((s) => s.id === parentId)
    ?? garden.zones.find((z) => z.id === parentId);
}

/** Compose a planting's world pose by adding its parent's offset. */
export function plantingWorldPose(
  garden: Pick<Garden, 'structures' | 'zones'>,
  planting: Pick<Planting, 'parentId' | 'x' | 'y'>,
): WorldPose {
  const parent = planting.parentId ? getPlantingParent(garden, planting.parentId) : undefined;
  return { x: (parent?.x ?? 0) + planting.x, y: (parent?.y ?? 0) + planting.y };
}

/** Convert world coords to local coords relative to a given parent. */
export function worldToLocalForParent(
  parent: { x: number; y: number },
  worldX: number,
  worldY: number,
): WorldPose {
  return { x: worldX - parent.x, y: worldY - parent.y };
}
