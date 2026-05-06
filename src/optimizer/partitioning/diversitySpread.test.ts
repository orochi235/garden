import { describe, it, expect } from 'vitest';
import { diversitySpreadPartitioner } from './diversitySpread';
import { DEFAULT_WEIGHTS, type OptimizationInput, type OptimizerPlant } from '../types';

function makeInput(plants: OptimizerPlant[]): OptimizationInput {
  return {
    bed: { widthIn: 48, lengthIn: 96, edgeClearanceIn: 0 },
    plants,
    weights: DEFAULT_WEIGHTS,
    gridResolutionIn: 4,
    timeLimitSec: 5,
    mipGap: 0.01,
    candidateCount: 1,
    diversityThreshold: 3,
  };
}

describe('diversitySpreadPartitioner', () => {
  it('matches when ≥4 categories all produce small (<5 plants) clusters', () => {
    const input = makeInput([
      { cultivarId: 'tomato', count: 2, footprintIn: 12, heightIn: null, category: 'vegetables' },
      { cultivarId: 'basil', count: 3, footprintIn: 6, heightIn: null, category: 'herbs' },
      { cultivarId: 'marigold', count: 2, footprintIn: 6, heightIn: null, category: 'flowers' },
      { cultivarId: 'strawberry', count: 4, footprintIn: 8, heightIn: null, category: 'fruit' },
    ]);
    const clusters = diversitySpreadPartitioner(input);
    expect(clusters).not.toBeNull();
    expect(clusters!.length).toBe(1);
    expect(clusters![0].key).toBe('diversity');
    expect(clusters![0].plants.length).toBe(4);
  });

  it('falls through (null) when only 3 small clusters exist', () => {
    const input = makeInput([
      { cultivarId: 'a', count: 2, footprintIn: 8, heightIn: null, category: 'vegetables' },
      { cultivarId: 'b', count: 2, footprintIn: 8, heightIn: null, category: 'herbs' },
      { cultivarId: 'c', count: 2, footprintIn: 8, heightIn: null, category: 'flowers' },
    ]);
    expect(diversitySpreadPartitioner(input)).toBeNull();
  });

  it('falls through (null) when any cluster has 5+ plants', () => {
    const input = makeInput([
      { cultivarId: 'tomato', count: 6, footprintIn: 12, heightIn: null, category: 'vegetables' },
      { cultivarId: 'basil', count: 2, footprintIn: 6, heightIn: null, category: 'herbs' },
      { cultivarId: 'marigold', count: 2, footprintIn: 6, heightIn: null, category: 'flowers' },
      { cultivarId: 'strawberry', count: 2, footprintIn: 8, heightIn: null, category: 'fruit' },
    ]);
    expect(diversitySpreadPartitioner(input)).toBeNull();
  });

  it('falls through (null) on a single cluster (homogeneous case)', () => {
    const input = makeInput([
      { cultivarId: 'a', count: 4, footprintIn: 8, heightIn: null, category: 'vegetables' },
      { cultivarId: 'b', count: 4, footprintIn: 8, heightIn: null, category: 'vegetables' },
    ]);
    expect(diversitySpreadPartitioner(input)).toBeNull();
  });

  it('preserves all plants in the merged cluster', () => {
    const input = makeInput([
      { cultivarId: 'a', count: 1, footprintIn: 8, heightIn: null, category: 'vegetables' },
      { cultivarId: 'b', count: 1, footprintIn: 8, heightIn: null, category: 'herbs' },
      { cultivarId: 'c', count: 1, footprintIn: 8, heightIn: null, category: 'flowers' },
      { cultivarId: 'd', count: 1, footprintIn: 8, heightIn: null, category: 'fruit' },
    ]);
    const clusters = diversitySpreadPartitioner(input);
    const ids = clusters![0].plants.map((p) => p.cultivarId).sort();
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });
});
