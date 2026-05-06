import { describe, it, expect } from 'vitest';
import { pairCoeff, pairContribution, ADJACENCY_IN } from './pairwiseScore';

const W = { shading: 1, sameSpeciesBuffer: 1 };

describe('pairCoeff', () => {
  it('is zero for distinct cultivars with same height', () => {
    expect(pairCoeff({ cultivarId: 'a', heightIn: 24 }, { cultivarId: 'b', heightIn: 24 }, W)).toBe(0);
  });
  it('is negative for same-cultivar pair (sameSpeciesBuffer penalty)', () => {
    expect(pairCoeff({ cultivarId: 'a', heightIn: 24 }, { cultivarId: 'a', heightIn: 24 }, W)).toBeLessThan(0);
  });
  it('is negative for distinct cultivars with different heights (shading penalty)', () => {
    expect(pairCoeff({ cultivarId: 'a', heightIn: 12 }, { cultivarId: 'b', heightIn: 60 }, W)).toBeLessThan(0);
  });
});

describe('pairContribution (cross-cluster diagnostic)', () => {
  it('is non-zero when same-cultivar plants land within adjacency range', () => {
    const a = { cultivarId: 'tomato', heightIn: 36 };
    const b = { cultivarId: 'tomato', heightIn: 36 };
    const v = pairContribution(a, { xIn: 0, yIn: 0 }, b, { xIn: 12, yIn: 0 }, W);
    expect(v).toBeLessThan(0);
  });

  it('is non-zero when shading-eligible plants land within adjacency range', () => {
    const a = { cultivarId: 'lettuce', heightIn: 8 };
    const b = { cultivarId: 'sunflower', heightIn: 72 };
    const v = pairContribution(
      a, { xIn: 0, yIn: 0 },
      b, { xIn: ADJACENCY_IN - 1, yIn: 0 },
      W,
    );
    expect(v).toBeLessThan(0);
  });

  it('is zero when plants are farther apart than ADJACENCY_IN, even with a non-zero coeff', () => {
    const a = { cultivarId: 'tomato', heightIn: 36 };
    const b = { cultivarId: 'tomato', heightIn: 36 };
    const v = pairContribution(
      a, { xIn: 0, yIn: 0 },
      b, { xIn: ADJACENCY_IN + 1, yIn: 0 },
      W,
    );
    expect(v).toBe(0);
  });

  it('is zero for distinct cultivars with same height regardless of distance', () => {
    const a = { cultivarId: 'a', heightIn: 24 };
    const b = { cultivarId: 'b', heightIn: 24 };
    expect(pairContribution(a, { xIn: 0, yIn: 0 }, b, { xIn: 1, yIn: 0 }, W)).toBe(0);
  });
});
