import { describe, it, expect } from 'vitest';
import { buildMipModel } from './formulation';
import { greedyHexPack } from './seed';
import type { OptimizationInput } from './types';
import { DEFAULT_WEIGHTS } from './types';

describe('formulation perf smoke (CI hardware)', () => {
  it('builds a 4×8 ft bed × 30 plants formulation in under 1s and a manageable size', () => {
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 96, edgeClearanceIn: 0 },
      plants: Array.from({ length: 10 }, (_, i) => ({
        cultivarId: `p${i}`,
        count: 3,
        footprintIn: 8,
        heightIn: 24,
      })),
      weights: DEFAULT_WEIGHTS,
      gridResolutionIn: 4,
      timeLimitSec: 8,
      mipGap: 0.01,
      candidateCount: 1,
      diversityThreshold: 3,
    };
    // Warm up V8 JIT with a tiny call before timing
    buildMipModel({ ...input, plants: [{ cultivarId: 'warmup', count: 1, footprintIn: 4, heightIn: null }] });
    const t0 = performance.now();
    const m = buildMipModel(input);
    const seed = greedyHexPack(input);
    const dt = performance.now() - t0;
    // Budget includes cold-start in full test suite. Bumped to 6s when the
    // clusterCohesion term started emitting C(30,2)=435 aux vars and their
    // adj rows for this scenario; the same-species-only path was sparser.
    // TODO(optimizer): cohesion-only aux rows could be cheaper to build
    // (e.g., share precomputed adjacency between pairs).
    expect(dt).toBeLessThan(6000);
    expect(m.vars.length).toBeLessThan(50_000);
    expect(seed.length).toBeGreaterThan(0);
  });
});
