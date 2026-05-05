import { describe, it, expect } from 'vitest';
import { buildMipModel } from './formulation';
import { DEFAULT_WEIGHTS, type OptimizationInput } from './types';

// HiGHS-WASM (highs-js 1.8.0) crashes when fed too many binary placement
// vars and/or too many same-species adjacency rows. The 8-tomato/4×7.5ft/4in
// case used to produce ~1760 binary vars and ~5650 adj rows and crash with
// "Too few lines". Snapping each plant's candidate cells to a footprint-aware
// pitch cuts var counts dramatically without quality loss.
//
// These regressions verify the LP topology stays well below the danger zone.
describe('8-tomato regression model topology', () => {
  it('keeps placement var count and adj rows below the HiGHS-WASM danger zone', () => {
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 90, trellis: null, edgeClearanceIn: 0 },
      plants: [{ cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null, climber: false }],
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs: {} },
      userRegions: [], timeLimitSec: 15, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    const model = buildMipModel(input);
    expect(model.aux.length).toBe(28); // C(8,2) same-species pairs
    expect(model.vars.length).toBeLessThan(800); // pre-fix was 1760
    const adjRows = model.constraints.filter((c) => c.label.startsWith('adj:'));
    expect(adjRows.length).toBeLessThan(1500); // pre-fix was ~5650; below same-species adj budget
  });

  it('every aux is for a same-species pair (so all adj rows are stripped on fallback)', () => {
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 90, trellis: null, edgeClearanceIn: 0 },
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
