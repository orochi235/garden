import { runOptimizer, DEFAULT_WEIGHTS, type OptimizationInput, type OptimizationResult, type OptimizerPlant, type CompanionTable, type RunHandle } from '../../optimizer';
import type { Structure } from '../../model/types';
import type { Cultivar } from '../../model/cultivars';
import { getRelation } from '../../data/companions';

export interface BedOptimizerArgs {
  bed: Structure;
  /** Plants the user wants placed: cultivar + desired count. */
  request: { cultivar: Cultivar; count: number }[];
  /** Diversity threshold (cells). Default 3. */
  diversityThreshold?: number;
  /** Time limit per candidate, sec. Default 5. */
  timeLimitSec?: number;
  /** Number of candidates. Default 3. */
  candidateCount?: number;
  onProgress?: (phase: string, candidate: number) => void;
}

export function runOptimizerForBed(args: BedOptimizerArgs): RunHandle {
  const FT_TO_IN = 12;
  const plants: OptimizerPlant[] = args.request.map(({ cultivar, count }) => ({
    cultivarId: cultivar.id,
    count,
    footprintIn: cultivar.footprintFt * FT_TO_IN,
    spacingIn: cultivar.spacingFt * FT_TO_IN,
    heightIn: cultivar.heightFt != null ? cultivar.heightFt * FT_TO_IN : null,
    climber: cultivar.climber,
    category: cultivar.category,
  }));

  const companions: CompanionTable = { pairs: buildCompanionTable(args.request.map((r) => r.cultivar)) };

  const input: OptimizationInput = {
    bed: {
      widthIn: args.bed.width * FT_TO_IN,
      lengthIn: args.bed.length * FT_TO_IN,
      trellis: args.bed.trellisEdge ? { kind: 'edge', edge: args.bed.trellisEdge } : null,
      edgeClearanceIn: 0,
    },
    plants,
    weights: zeroWeightsIfDebug(),
    gridResolutionIn: 4,
    companions,
    userRegions: [],
    timeLimitSec: args.timeLimitSec ?? 5,
    mipGap: 0.01,
    candidateCount: args.candidateCount ?? 3,
    diversityThreshold: args.diversityThreshold ?? 3,
  };

  return runOptimizer(input, { onProgress: args.onProgress });
}

export type { OptimizationResult };

/**
 * Debug toggle: when the URL has `?optWeights=zero`, return all-zero weights so
 * the LP objective collapses to "place as many plants as possible." This makes
 * it trivial to see whether the diversity machinery (no-good cuts +
 * perturbation) is producing varied candidates, since soft-objective bonuses no
 * longer dominate the score.
 */
function zeroWeightsIfDebug() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('optWeights') === 'zero') {
    console.info('[optimizer] DEBUG: zeroing all weights via ?optWeights=zero');
    return { shading: 0, companion: 0, antagonist: 0, sameSpeciesBuffer: 0, trellisAttraction: 0, regionPreference: 0, clusterCohesion: 0 };
  }
  return DEFAULT_WEIGHTS;
}

function buildCompanionTable(cultivars: Cultivar[]): CompanionTable['pairs'] {
  const out: CompanionTable['pairs'] = {};
  for (let i = 0; i < cultivars.length; i++) {
    for (let j = i + 1; j < cultivars.length; j++) {
      const rel = getRelation(cultivars[i].speciesId, cultivars[j].speciesId);
      if (!rel) continue;
      const key = [cultivars[i].id, cultivars[j].id].sort().join('|');
      out[key] = rel;
    }
  }
  return out;
}
