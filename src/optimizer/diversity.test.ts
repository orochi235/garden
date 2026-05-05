import { describe, it, expect } from 'vitest';
import { buildNoGoodCut, perturbWeights } from './diversity';

describe('buildNoGoodCut', () => {
  it('produces a constraint forbidding solutions within k_diff of the prior', () => {
    const prior = ['x_0_1_2', 'x_1_3_4', 'x_2_0_0'];
    const cut = buildNoGoodCut(prior, 2);
    expect(Object.keys(cut.terms).sort()).toEqual(prior.slice().sort());
    expect(cut.op).toBe('<=');
    expect(cut.rhs).toBe(prior.length - 2);
  });
});

describe('perturbWeights', () => {
  it('perturbs each weight by ≤ ±5%', () => {
    const seed = 42;
    const before = { shading: 1, companion: 1, antagonist: 1, sameSpeciesBuffer: 1, trellisAttraction: 1, regionPreference: 1 };
    const after = perturbWeights(before, 0.05, seed);
    for (const k of Object.keys(before) as Array<keyof typeof before>) {
      expect(Math.abs(after[k] - before[k])).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });
});
