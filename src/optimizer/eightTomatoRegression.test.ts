import { describe, it, expect } from 'vitest';
import { buildMipModel } from './formulation';
import { DEFAULT_WEIGHTS, type OptimizationInput } from './types';

// HiGHS-WASM (highs-js 1.8.0) crashes mid-solve when fed the LP for 8
// same-cultivar copies in a 4×7.5ft raised bed at 4-inch grid resolution.
// The crash mode varies ("table index is out of bounds", "Too few lines",
// "Aborted()") because the WASM heap state from one solve call leaks
// into the next. The same-species adjacency rows are responsible — see
// `worker.ts` which retries without them on solver failure.
//
// We don't assert on a specific solver outcome here (it's flaky upstream),
// only that the model topology that triggers the bug is what we expect:
// a small handful of aux variables with a large number of adjacency rows.
describe('8-tomato regression model topology', () => {
  it('produces lots of same-species adjacency rows', () => {
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 90, trellisEdge: null, edgeClearanceIn: 0 },
      plants: [{ cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null, climber: false }],
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs: {} },
      userRegions: [], timeLimitSec: 15, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    const model = buildMipModel(input);
    expect(model.aux.length).toBe(28); // C(8,2) same-species pairs
    const adjRows = model.constraints.filter((c) => c.label.startsWith('adj:'));
    expect(adjRows.length).toBeGreaterThan(5000); // dense neighborhood × pairs
  });

  it('every aux is for a same-species pair (so all adj rows are stripped on fallback)', () => {
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 90, trellisEdge: null, edgeClearanceIn: 0 },
      plants: [{ cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null, climber: false }],
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs: {} },
      userRegions: [], timeLimitSec: 15, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    const model = buildMipModel(input);
    for (const aux of model.aux) {
      const m = aux.name.match(/^n_(\d+)_(\d+)$/);
      expect(m).not.toBeNull();
      const a = Number(m![1]);
      const b = Number(m![2]);
      expect(model.plants[a].cultivarId).toBe(model.plants[b].cultivarId);
    }
  });
});
