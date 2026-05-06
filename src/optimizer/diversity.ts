import type { OptimizerWeights } from './types';

export function buildNoGoodCut(
  priorVarNames: string[],
  kDiff: number,
): { terms: Record<string, number>; op: '<='; rhs: number; label: string } {
  const terms: Record<string, number> = {};
  for (const v of priorVarNames) terms[v] = 1;
  return { terms, op: '<=', rhs: priorVarNames.length - kDiff, label: 'nogood' };
}

export function perturbWeights(w: OptimizerWeights, magnitude: number, seed: number): OptimizerWeights {
  const rng = mulberry32(seed);
  return {
    shading: w.shading * (1 + (rng() * 2 - 1) * magnitude),
    sameSpeciesBuffer: w.sameSpeciesBuffer * (1 + (rng() * 2 - 1) * magnitude),
  };
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
