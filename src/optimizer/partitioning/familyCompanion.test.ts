import { describe, it, expect } from 'vitest';
import { familyCompanionPartitioner } from './familyCompanion';
import { DEFAULT_WEIGHTS, type OptimizationInput, type OptimizerPlant } from '../types';

function makeInput(plants: OptimizerPlant[], pairs: Record<string, 'companion' | 'antagonist'> = {}): OptimizationInput {
  return {
    bed: { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 },
    plants,
    weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs },
    userRegions: [], timeLimitSec: 5, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
  };
}

describe('familyCompanionPartitioner', () => {
  it('groups plants by category', () => {
    const input = makeInput([
      { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
      { cultivarId: 'basil', count: 4, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
    ]);
    const clusters = familyCompanionPartitioner(input);
    expect(clusters.length).toBe(2);
    const keys = clusters.map((c) => c.key).sort();
    expect(keys).toEqual(['herbs', 'vegetables']);
  });

  it('groups plants without category into a single "other" cluster', () => {
    const input = makeInput([
      { cultivarId: 'mystery', count: 2, footprintIn: 8, heightIn: null, climber: false },
      { cultivarId: 'unknown', count: 2, footprintIn: 8, heightIn: null, climber: false },
    ]);
    const clusters = familyCompanionPartitioner(input);
    expect(clusters.length).toBe(1);
    expect(clusters[0].key).toBe('other');
    expect(clusters[0].plants.length).toBe(2);
  });

  it('merges two categories when a strong companion bridge exists', () => {
    const input = makeInput(
      [
        { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
        { cultivarId: 'basil', count: 4, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
      ],
      { 'basil|tomato': 'companion' },
    );
    const clusters = familyCompanionPartitioner(input);
    expect(clusters.length).toBe(1);
    expect(clusters[0].plants.length).toBe(2);
  });

  it('does not merge when only an antagonist relation exists', () => {
    const input = makeInput(
      [
        { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
        { cultivarId: 'fennel', count: 4, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
      ],
      { 'fennel|tomato': 'antagonist' },
    );
    const clusters = familyCompanionPartitioner(input);
    expect(clusters.length).toBe(2);
  });

  it('chains merges transitively (A↔B and B↔C produce one cluster)', () => {
    const input = makeInput(
      [
        { cultivarId: 'tomato', count: 2, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
        { cultivarId: 'basil', count: 2, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
        { cultivarId: 'marigold', count: 2, footprintIn: 6, heightIn: null, climber: false, category: 'flowers' },
      ],
      { 'basil|tomato': 'companion', 'basil|marigold': 'companion' },
    );
    const clusters = familyCompanionPartitioner(input);
    expect(clusters.length).toBe(1);
    expect(clusters[0].plants.length).toBe(3);
  });

  it('counts climbers per cluster', () => {
    const input = makeInput([
      { cultivarId: 'pole-bean', count: 6, footprintIn: 6, heightIn: null, climber: true, category: 'legumes' },
      { cultivarId: 'tomato', count: 2, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
    ]);
    const clusters = familyCompanionPartitioner(input);
    const beans = clusters.find((c) => c.key === 'legumes')!;
    const veggies = clusters.find((c) => c.key === 'vegetables')!;
    expect(beans.climberCount).toBe(6);
    expect(veggies.climberCount).toBe(0);
  });

  it('orders clusters by total footprint area descending (largest first)', () => {
    const input = makeInput([
      { cultivarId: 'basil', count: 2, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
      { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
    ]);
    const clusters = familyCompanionPartitioner(input);
    expect(clusters[0].key).toBe('vegetables');
    expect(clusters[1].key).toBe('herbs');
  });

  it('produces deterministic ordering for identical inputs', () => {
    const input = makeInput([
      { cultivarId: 'a', count: 2, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
      { cultivarId: 'b', count: 2, footprintIn: 6, heightIn: null, climber: false, category: 'flowers' },
    ]);
    const c1 = familyCompanionPartitioner(input);
    const c2 = familyCompanionPartitioner(input);
    expect(c1.map((c) => c.key)).toEqual(c2.map((c) => c.key));
  });
});
