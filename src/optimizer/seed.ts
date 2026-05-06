import type { OptimizationInput } from './types';

export interface SeedPlacement {
  cultivarId: string;
  xIn: number;
  yIn: number;
  footprintIn: number;
  /** Spacing radius used for collision checks. */
  spacingIn: number;
  /** Insertion order — used by tests, not by the solver. */
  placedAt: number;
}

/**
 * Best-effort greedy hex packing. Sorts by spacing (descending) and walks a
 * staggered hex grid for the first cell that respects every other plant's
 * spacing requirement. Spacing — not visual footprint — is what determines
 * collision: two plants whose footprints don't visually overlap may still
 * need to be planted further apart than that to thrive.
 */
export function greedyHexPack(input: OptimizationInput): SeedPlacement[] {
  // Pre-seed `out` with any existing placements that match a requested
  // cultivar. Each preserved placement consumes one unit from its cultivar's
  // remaining count, so the hex packer fills only the leftover demand into
  // unclaimed space. First-wins on overlaps.
  const out: SeedPlacement[] = [];
  const m = input.bed.edgeClearanceIn;
  const w = input.bed.widthIn;
  const h = input.bed.lengthIn;

  const remaining = new Map<string, number>();
  for (const p of input.plants) remaining.set(p.cultivarId, p.count);

  if (input.existingPlacements && input.existingPlacements.length > 0) {
    const plantByCultivar = new Map(input.plants.map((p) => [p.cultivarId, p]));
    for (const ep of input.existingPlacements) {
      const plant = plantByCultivar.get(ep.cultivarId);
      if (!plant) continue;
      const left = remaining.get(ep.cultivarId) ?? 0;
      if (left <= 0) continue;
      const spacingIn = plant.spacingIn ?? plant.footprintIn;
      const r = spacingIn / 2;
      // Bounds check: must fit within bed (with edge clearance).
      if (ep.xIn - r < m || ep.xIn + r > w - m) continue;
      if (ep.yIn - r < m || ep.yIn + r > h - m) continue;
      // First-wins overlap check against already-preserved placements.
      if (collides(out, ep.xIn, ep.yIn, r)) continue;
      out.push({
        cultivarId: ep.cultivarId,
        xIn: ep.xIn,
        yIn: ep.yIn,
        footprintIn: plant.footprintIn,
        spacingIn,
        placedAt: out.length,
      });
      remaining.set(ep.cultivarId, left - 1);
    }
  }

  const expanded: { cultivarId: string; footprintIn: number; spacingIn: number }[] = [];
  for (const p of input.plants) {
    const spacingIn = p.spacingIn ?? p.footprintIn;
    const left = remaining.get(p.cultivarId) ?? 0;
    for (let i = 0; i < left; i++) {
      expanded.push({ cultivarId: p.cultivarId, footprintIn: p.footprintIn, spacingIn });
    }
  }
  expanded.sort((a, b) => b.spacingIn - a.spacingIn);

  for (const plant of expanded) {
    const r = plant.spacingIn / 2;
    let placed = false;
    const pitch = plant.spacingIn;
    const rowStep = (pitch * Math.sqrt(3)) / 2;
    let row = 0;

    for (let y = m + r; y + r <= h - m && !placed; y += rowStep) {
      const offset = row % 2 === 0 ? 0 : pitch / 2;
      for (let x = m + r + offset; x + r <= w - m; x += pitch) {
        if (!collides(out, x, y, r)) {
          out.push({
            cultivarId: plant.cultivarId,
            xIn: x,
            yIn: y,
            footprintIn: plant.footprintIn,
            spacingIn: plant.spacingIn,
            placedAt: out.length,
          });
          placed = true;
          break;
        }
      }
      row++;
    }
  }
  return out;
}

function collides(existing: SeedPlacement[], x: number, y: number, r: number): boolean {
  for (const e of existing) {
    const dx = x - e.xIn;
    const dy = y - e.yIn;
    const minDist = r + e.spacingIn / 2;
    if (dx * dx + dy * dy < minDist * minDist) return true;
  }
  return false;
}
