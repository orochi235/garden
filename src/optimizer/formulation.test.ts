import { describe, it, expect } from 'vitest';
import { buildMipModel } from './formulation';
import type { OptimizationInput } from './types';
import { DEFAULT_WEIGHTS } from './types';

const tinyInput: OptimizationInput = {
  bed: { widthIn: 16, lengthIn: 16, trellis: null, edgeClearanceIn: 0 },
  plants: [{ cultivarId: 'a', count: 2, footprintIn: 4, heightIn: null, climber: false }],
  weights: DEFAULT_WEIGHTS,
  gridResolutionIn: 4,
  companions: { pairs: {} },
  userRegions: [],
  timeLimitSec: 5,
  mipGap: 0.01,
  candidateCount: 1,
  diversityThreshold: 3,
};

describe('buildMipModel', () => {
  it('discretizes the bed into the right cell grid', () => {
    const m = buildMipModel(tinyInput);
    expect(m.cells.length).toBe(4 * 4);
  });

  it('emits exactly-one placement constraint per plant copy', () => {
    const m = buildMipModel(tinyInput);
    const placement = m.constraints.filter((c) => c.label.startsWith('placement:'));
    expect(placement).toHaveLength(2);
    expect(placement[0].op).toBe('=');
    expect(placement[0].rhs).toBe(1);
  });

  it('emits one cell-coverage constraint per cell', () => {
    const m = buildMipModel(tinyInput);
    const coverage = m.constraints.filter((c) => c.label.startsWith('coverage:'));
    expect(coverage).toHaveLength(4 * 4);
  });

  it('breaks symmetry: identical plant copies are lex-ordered', () => {
    const m = buildMipModel(tinyInput);
    const sym = m.constraints.filter((c) => c.label.startsWith('sym:'));
    expect(sym.length).toBeGreaterThan(0);
  });

  it('prunes cells inside the edge-clearance band', () => {
    const padded: OptimizationInput = {
      ...tinyInput,
      bed: { ...tinyInput.bed, edgeClearanceIn: 4 },
    };
    const m = buildMipModel(padded);
    expect(m.cells.length).toBeLessThan(4 * 4);
  });

  it('emits aux vars for pairs subject to companion/antagonist relationships', () => {
    const input = { ...tinyInput, plants: [
      { cultivarId: 'tomato', count: 1, footprintIn: 4, heightIn: 60, climber: false },
      { cultivarId: 'basil', count: 1, footprintIn: 4, heightIn: 12, climber: false },
    ], companions: { pairs: { 'basil|tomato': 'companion' as const } } };
    const m = buildMipModel(input);
    const auxNames = m.aux.map((a) => a.name);
    expect(auxNames.some((n) => n.startsWith('n_0_1'))).toBe(true);
  });
});
