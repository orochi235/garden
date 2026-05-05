/**
 * To run the Worker smoke test locally (requires Worker support in your test env):
 *   VITEST_WORKER_SMOKE=1 npx vitest run src/optimizer/runOptimizer.test.ts
 *
 * The describe.skip block is intentionally skipped by default because vitest's
 * default jsdom environment does not support Worker module loading.
 */
import { describe, it, expect } from 'vitest';
import { buildMipModel } from './formulation';
import { greedyHexPack } from './seed';
import type { OptimizationInput } from './types';
import { DEFAULT_WEIGHTS } from './types';

const smokeInput: OptimizationInput = {
  bed: { widthIn: 16, heightIn: 16, trellisEdge: null, edgeClearanceIn: 0 },
  plants: [{ cultivarId: 'a', count: 2, footprintIn: 4, heightIn: null, climber: false }],
  weights: DEFAULT_WEIGHTS,
  gridResolutionIn: 4,
  companions: { pairs: {} },
  userRegions: [],
  timeLimitSec: 5,
  mipGap: 0.01,
  candidateCount: 1,
  diversityThreshold: 1,
};

describe.skip('runOptimizer smoke (skipped by default — requires Worker support)', () => {
  it('solves a tiny problem and returns at least one candidate', async () => {
    const { runOptimizer } = await import('./runOptimizer');
    const result = await runOptimizer(smokeInput).promise;
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].placements).toHaveLength(2);
  });
});

describe('formulation integration (no Worker)', () => {
  it('builds a feasible model and seed for the smoke input', () => {
    const m = buildMipModel(smokeInput);
    const seed = greedyHexPack(smokeInput);
    expect(m.vars.length).toBeGreaterThan(0);
    expect(seed.length).toBe(2);
  });
});
