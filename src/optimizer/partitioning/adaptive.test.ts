import { describe, it, expect } from 'vitest';
import { adaptivePartitioner } from './adaptive';
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

describe('adaptivePartitioner', () => {
  it('returns null for homogeneous single-category input (bypass to unified)', () => {
    const input = makeInput([
      { cultivarId: 't1', count: 4, footprintIn: 12, heightIn: null, category: 'vegetables' },
      { cultivarId: 't2', count: 4, footprintIn: 12, heightIn: null, category: 'vegetables' },
    ]);
    expect(adaptivePartitioner(input)).toBeNull();
  });

  it('returns null when all plants are uncategorized (single "other" bucket)', () => {
    const input = makeInput([
      { cultivarId: 'a', count: 4, footprintIn: 8, heightIn: null },
      { cultivarId: 'b', count: 4, footprintIn: 8, heightIn: null },
    ]);
    expect(adaptivePartitioner(input)).toBeNull();
  });

  it('returns clusters as today for mixed-category input', () => {
    const input = makeInput([
      { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, category: 'vegetables' },
      { cultivarId: 'basil', count: 4, footprintIn: 6, heightIn: null, category: 'herbs' },
    ]);
    const clusters = adaptivePartitioner(input);
    expect(clusters).not.toBeNull();
    expect(clusters!.length).toBe(2);
    const keys = clusters!.map((c) => c.key).sort();
    expect(keys).toEqual(['herbs', 'vegetables']);
  });

  it('returns clusters for a single plant entry that still spans only one category', () => {
    // Sanity check: 8 same-category plants → still one cluster → bypass.
    const input = makeInput([
      { cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null, category: 'vegetables' },
    ]);
    expect(adaptivePartitioner(input)).toBeNull();
  });
});
