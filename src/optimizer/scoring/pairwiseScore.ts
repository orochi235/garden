/**
 * Pairwise objective contribution for two placed plants.
 *
 * The clustered solver runs each sub-bed independently, so plant pairs that
 * land in different clusters never contribute to the MIP objective. This
 * helper centralizes the per-pair scoring math used by:
 *
 *   - `formulation.ts` — to compute the auxiliary-variable coefficient for the
 *     `n_{a,b}` indicator at model-build time (placement-agnostic).
 *   - `worker.ts` — to compute a post-hoc cross-cluster diagnostic score after
 *     placements are finalized (placement-aware: only pairs within
 *     `ADJACENCY_IN` of each other contribute).
 *
 * Keep this file dependency-free w/r/t project types — `src/optimizer/` is
 * extracted to a standalone package.
 */
import { normalizeShadingTerm } from '../weights';

/** Pairs farther apart than this contribute zero. Mirrors `formulation.ts`. */
export const ADJACENCY_IN = 24;

export interface PairPlant {
  cultivarId: string;
  heightIn: number | null;
}

export interface PairWeights {
  shading: number;
  sameSpeciesBuffer: number;
}

/**
 * The (negative) per-pair coefficient that would be applied if both plants
 * land within `ADJACENCY_IN`. Placement-independent. Used by formulation.ts
 * as the aux-var objective coefficient.
 */
export function pairCoeff(a: PairPlant, b: PairPlant, weights: PairWeights): number {
  const sameSpecies = a.cultivarId === b.cultivarId;
  const hasShading =
    a.heightIn != null && b.heightIn != null && a.heightIn !== b.heightIn;

  let c = 0;
  if (sameSpecies) c -= weights.sameSpeciesBuffer;
  if (hasShading) {
    const hA = a.heightIn as number;
    const hB = b.heightIn as number;
    c -= weights.shading * normalizeShadingTerm(Math.max(hA, hB), Math.min(hA, hB));
  }
  return Number.isFinite(c) ? c : 0;
}

/**
 * Realized contribution to the objective for a placed pair. Returns zero when
 * the placements are farther apart than `ADJACENCY_IN` (matches the indicator
 * semantics of the `n_{a,b}` aux var).
 */
export function pairContribution(
  a: PairPlant,
  aPos: { xIn: number; yIn: number },
  b: PairPlant,
  bPos: { xIn: number; yIn: number },
  weights: PairWeights,
): number {
  const dist = Math.hypot(aPos.xIn - bPos.xIn, aPos.yIn - bPos.yIn);
  if (dist > ADJACENCY_IN) return 0;
  return pairCoeff(a, b, weights);
}
