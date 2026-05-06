import { runOptimizer, DEFAULT_WEIGHTS, type OptimizationInput, type OptimizationResult, type OptimizerPlant, type RunHandle } from '../../optimizer';
import type { Structure } from '../../model/types';
import type { Cultivar } from '../../model/cultivars';

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
  const plants: OptimizerPlant[] = args.request.map(({ cultivar, count }) => {
    // Prefer cultivar-level override (e.g. determinate vs. indeterminate
    // tomato) when present; otherwise fall back to the resolved species
    // default already merged into `cultivar.heightFt`.
    const heightFt = cultivar.heightFtOverride ?? cultivar.heightFt;
    return {
      cultivarId: cultivar.id,
      count,
      footprintIn: cultivar.footprintFt * FT_TO_IN,
      spacingIn: cultivar.spacingFt * FT_TO_IN,
      heightIn: heightFt != null ? heightFt * FT_TO_IN : null,
      category: cultivar.category,
    };
  });

  const input: OptimizationInput = {
    bed: {
      widthIn: args.bed.width * FT_TO_IN,
      lengthIn: args.bed.length * FT_TO_IN,
      edgeClearanceIn: 0,
    },
    plants,
    weights: zeroWeightsIfDebug(),
    gridResolutionIn: 4,
    timeLimitSec: args.timeLimitSec ?? 5,
    mipGap: 0.01,
    candidateCount: args.candidateCount ?? 3,
    diversityThreshold: args.diversityThreshold ?? 3,
  };

  return runOptimizer(input, { onProgress: args.onProgress });
}

export type { OptimizationResult };

/**
 * Debug toggle: when the URL has `?optWeights=zero`, return all-zero weights
 * (sets every objective term to 0).
 */
function zeroWeightsIfDebug() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('optWeights') === 'zero') {
    console.info('[optimizer] DEBUG: zeroing all weights via ?optWeights=zero');
    return { shading: 0, sameSpeciesBuffer: 0 };
  }
  return DEFAULT_WEIGHTS;
}
