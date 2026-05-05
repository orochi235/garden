import { describe, it, expect } from 'vitest';
import { buildMipModel } from './formulation';
import { greedyHexPack } from './seed';
import type { OptimizationInput } from './types';
import { DEFAULT_WEIGHTS } from './types';

describe('formulation perf smoke (CI hardware)', () => {
  it('builds a 4×8 ft bed × 30 plants formulation in under 1s and a manageable size', () => {
    const input: OptimizationInput = {
      bed: { widthIn: 48, heightIn: 96, trellisEdge: 'N', edgeClearanceIn: 0 },
      plants: Array.from({ length: 10 }, (_, i) => ({
        cultivarId: `p${i}`,
        count: 3,
        footprintIn: 8,
        heightIn: 24,
        climber: i % 5 === 0,
      })),
      weights: DEFAULT_WEIGHTS,
      gridResolutionIn: 4,
      companions: { pairs: {} },
      userRegions: [],
      timeLimitSec: 8,
      mipGap: 0.01,
      candidateCount: 1,
      diversityThreshold: 3,
    };
    const t0 = performance.now();
    const m = buildMipModel(input);
    const seed = greedyHexPack(input);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(1000);
    expect(m.vars.length).toBeLessThan(50_000);
    expect(seed.length).toBeGreaterThan(0);
  });
});
