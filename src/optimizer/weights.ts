/**
 * Each soft objective term contributes a value normalized to roughly [0, 1] per
 * pair / per plant before weighting. This lets users reason about weights
 * independently — toggling a term off doesn't silently rescale the rest.
 */

const MAX_HEIGHT_DIFF_IN = 96;

export function normalizeShadingTerm(tallerHeightIn: number, shorterHeightIn: number): number {
  const diff = Math.max(0, tallerHeightIn - shorterHeightIn);
  return Math.min(1, diff / MAX_HEIGHT_DIFF_IN);
}

const COMPANION_DECAY_IN = 24;

export function normalizeCompanionTerm(distanceIn: number, _adjacencyThresholdIn: number): number {
  if (distanceIn <= 0) return 1;
  if (distanceIn >= COMPANION_DECAY_IN * 2) return 0;
  return Math.max(0, 1 - distanceIn / (COMPANION_DECAY_IN * 2));
}
