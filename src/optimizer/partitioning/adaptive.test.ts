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

  it('returns family-companion clusters for mixed-category input that does not match paired-mirror or diversity-spread', () => {
    // Lopsided counts (8 + 1) reject paired-mirror; the large 8-plant cluster
    // rejects diversity-spread. → falls through to family-companion default.
    const input = makeInput([
      { cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null, category: 'vegetables' },
      { cultivarId: 'basil', count: 1, footprintIn: 6, heightIn: null, category: 'herbs' },
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

  it('uses paired-mirror partitioner for 2 cultivars × 4 each across categories', () => {
    // Even though categories differ, the paired-mirror partitioner collapses
    // them into one cluster so the MILP can interleave them.
    const input = makeInput([
      { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, category: 'vegetables' },
      { cultivarId: 'basil', count: 4, footprintIn: 6, heightIn: null, category: 'herbs' },
    ]);
    const clusters = adaptivePartitioner(input);
    expect(clusters).not.toBeNull();
    expect(clusters!.length).toBe(1);
    expect(clusters![0].key).toBe('paired-mirror');
  });

  it('uses diversity-spread partitioner when 4+ tiny clusters appear', () => {
    const input = makeInput([
      { cultivarId: 'a', count: 2, footprintIn: 8, heightIn: null, category: 'vegetables' },
      { cultivarId: 'b', count: 2, footprintIn: 8, heightIn: null, category: 'herbs' },
      { cultivarId: 'c', count: 2, footprintIn: 8, heightIn: null, category: 'flowers' },
      { cultivarId: 'd', count: 2, footprintIn: 8, heightIn: null, category: 'fruit' },
    ]);
    const clusters = adaptivePartitioner(input);
    expect(clusters).not.toBeNull();
    expect(clusters!.length).toBe(1);
    expect(clusters![0].key).toBe('diversity');
  });

  it('falls back to family-companion default for typical mixed input', () => {
    // 3 categories, one large cluster (8) → no paired-mirror (lopsided),
    // no diversity-spread (large cluster present) → default.
    const input = makeInput([
      { cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null, category: 'vegetables' },
      { cultivarId: 'basil', count: 2, footprintIn: 6, heightIn: null, category: 'herbs' },
      { cultivarId: 'marigold', count: 2, footprintIn: 6, heightIn: null, category: 'flowers' },
    ]);
    const clusters = adaptivePartitioner(input);
    expect(clusters).not.toBeNull();
    expect(clusters!.length).toBe(3);
    const keys = clusters!.map((c) => c.key).sort();
    expect(keys).toEqual(['flowers', 'herbs', 'vegetables']);
  });
});
