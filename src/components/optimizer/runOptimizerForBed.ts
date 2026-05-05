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
    heightIn: cultivar.heightFt != null ? cultivar.heightFt * FT_TO_IN : null,
    climber: cultivar.climber,
  }));

  const companions: CompanionTable = { pairs: buildCompanionTable(args.request.map((r) => r.cultivar)) };

  const input: OptimizationInput = {
    bed: {
      widthIn: args.bed.width * FT_TO_IN,
      heightIn: args.bed.height * FT_TO_IN,
      trellisEdge: args.bed.trellisEdge,
      edgeClearanceIn: 0,
    },
    plants,
    weights: DEFAULT_WEIGHTS,
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
