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
  const expanded: { cultivarId: string; footprintIn: number; spacingIn: number }[] = [];
  for (const p of input.plants) {
    const spacingIn = p.spacingIn ?? p.footprintIn;
    for (let i = 0; i < p.count; i++) {
      expanded.push({ cultivarId: p.cultivarId, footprintIn: p.footprintIn, spacingIn });
    }
  }
  expanded.sort((a, b) => b.spacingIn - a.spacingIn);

  const out: SeedPlacement[] = [];
  const m = input.bed.edgeClearanceIn;
  const w = input.bed.widthIn;
  const h = input.bed.lengthIn;

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
