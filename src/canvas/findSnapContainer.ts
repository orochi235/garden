import { computeSlots } from '../model/arrangement';
import { getCultivar } from '../model/cultivars';
import type { Garden, Planting } from '../model/types';
import { getPlantableBounds } from '../model/types';
import { plantingWorldPose } from '../utils/plantingPose';

/** Multiplier applied to planting footprint radius for attraction distance. */
export const SNAP_RADIUS_MULTIPLIER = 2.0;

/** Extra buffer (ft) added to the spatial cull distance. */
export const CULL_BUFFER_FT = 1.0;

export interface SnapCandidate {
  id: string;
  kind: 'structure' | 'zone';
  distance: number;
  slotX: number;
  slotY: number;
  /** True when the cursor is geometrically inside the container bounds. */
  cursorInside: boolean;
  /** True when the container has no existing children (excluding the dragged planting). */
  empty: boolean;
}

/**
 * Find the nearest container that can accept a planting, given the cursor's
 * world position. Returns null if nothing is in range or has capacity.
 */
export function findSnapContainer(
  worldX: number,
  worldY: number,
  planting: Planting,
  garden: Garden,
): SnapCandidate | null {
  const cultivar = getCultivar(planting.cultivarId);
  const footprintRadius = (cultivar?.footprintFt ?? 0.5) / 2;
  const attractionRadius = footprintRadius * SNAP_RADIUS_MULTIPLIER;

  // Only exclude the current parent if the planting is still inside it.
  // If the planting has been dragged outside its parent, allow snapping back.
  const excludeParentId = (() => {
    const parent = garden.structures.find((s) => s.id === planting.parentId)
      ?? garden.zones.find((z) => z.id === planting.parentId);
    if (!parent) return planting.parentId;
    const { x: pw, y: ph } = plantingWorldPose(garden, planting);
    const inside = 'shape' in parent && parent.shape === 'circle'
      ? pointInEllipse(pw, ph, parent.x, parent.y, parent.width, parent.length)
      : pointInRect(pw, ph, parent.x, parent.y, parent.width, parent.length);
    return inside ? planting.parentId : null;
  })();

  type RawCandidate = {
    id: string;
    kind: 'structure' | 'zone';
    x: number;
    y: number;
    width: number;
    length: number;
    shape: 'rectangle' | 'circle';
    arrangement: import('../model/arrangement').Arrangement | null;
    distance: number;
  };

  const candidates: RawCandidate[] = [];

  // Collect container structures
  for (const s of garden.structures) {
    if (!s.container || s.id === excludeParentId) continue;
    const cx = s.x + s.width / 2;
    const cy = s.y + s.length / 2;
    const dist = Math.hypot(worldX - cx, worldY - cy);
    const boundingRadius = Math.max(s.width, s.length) / 2;
    if (dist > boundingRadius + attractionRadius + CULL_BUFFER_FT) continue;
    candidates.push({
      id: s.id,
      kind: 'structure',
      x: s.x,
      y: s.y,
      width: s.width,
      length: s.length,
      shape: s.shape === 'circle' ? 'circle' : 'rectangle',
      arrangement: s.arrangement,
      distance: dist,
    });
  }

  // Collect zones
  for (const z of garden.zones) {
    if (z.id === excludeParentId) continue;
    const cx = z.x + z.width / 2;
    const cy = z.y + z.length / 2;
    const dist = Math.hypot(worldX - cx, worldY - cy);
    const boundingRadius = Math.max(z.width, z.length) / 2;
    if (dist > boundingRadius + attractionRadius + CULL_BUFFER_FT) continue;
    candidates.push({
      id: z.id,
      kind: 'zone',
      x: z.x,
      y: z.y,
      width: z.width,
      length: z.length,
      shape: 'rectangle',
      arrangement: z.arrangement,
      distance: dist,
    });
  }

  if (candidates.length === 0) return null;

  // Sort by distance (nearest first) so we can short-circuit
  candidates.sort((a, b) => a.distance - b.distance);

  // Check capacity and find first available slot for each candidate
  for (const c of candidates) {
    // Is the cursor within the container bounds or within attraction radius of center?
    const insideBounds = c.shape === 'circle'
      ? pointInEllipse(worldX, worldY, c.x, c.y, c.width, c.length)
      : pointInRect(worldX, worldY, c.x, c.y, c.width, c.length);
    if (!insideBounds && c.distance > Math.max(c.width, c.length) / 2 + attractionRadius) {
      continue;
    }

    const slot = findAvailableSlot(c, planting, garden);
    if (slot) {
      const existingChildren = garden.plantings.filter(
        (p) => p.parentId === c.id && p.id !== planting.id,
      );
      return {
        id: c.id,
        kind: c.kind,
        distance: c.distance,
        slotX: slot.x,
        slotY: slot.y,
        cursorInside: insideBounds,
        empty: existingChildren.length === 0,
      };
    }
  }

  return null;
}

function findAvailableSlot(
  container: {
    id: string;
    x: number;
    y: number;
    width: number;
    length: number;
    shape: 'rectangle' | 'circle';
    arrangement: import('../model/arrangement').Arrangement | null;
  },
  planting: Planting,
  garden: Garden,
): { x: number; y: number } | null {
  const arrangement = container.arrangement;
  if (!arrangement) return null;

  if (arrangement.type === 'free') {
    // Free arrangement always has room — slot at container center
    return {
      x: container.width / 2,
      y: container.length / 2,
    };
  }

  const bounds = getPlantableBounds(container);

  const slots = computeSlots(arrangement, bounds);

  // Count existing children in this container (not counting the planting being dragged)
  const existingChildren = garden.plantings.filter(
    (p) => p.parentId === container.id && p.id !== planting.id,
  );

  if (existingChildren.length >= slots.length) return null;

  // Find first unoccupied slot
  const occupiedSet = new Set(existingChildren.map((p) => `${p.x},${p.y}`));
  for (const slot of slots) {
    const relX = slot.x - container.x;
    const relY = slot.y - container.y;
    if (!occupiedSet.has(`${relX},${relY}`)) {
      return { x: relX, y: relY };
    }
  }

  return null;
}

function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function pointInEllipse(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  if (rx === 0 || ry === 0) return false;
  return (px - cx) ** 2 / rx ** 2 + (py - cy) ** 2 / ry ** 2 <= 1;
}
