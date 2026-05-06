import { describe, it, expect } from 'vitest';
import { pairedMirrorPartitioner } from './pairedMirror';
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

describe('pairedMirrorPartitioner', () => {
  it('matches 2 cultivars × 4 each (canonical pair)', () => {
    const input = makeInput([
      { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, category: 'vegetables' },
      { cultivarId: 'pepper', count: 4, footprintIn: 12, heightIn: null, category: 'vegetables' },
    ]);
    const clusters = pairedMirrorPartitioner(input);
    expect(clusters).not.toBeNull();
    expect(clusters!.length).toBe(1);
    expect(clusters![0].plants.length).toBe(2);
    expect(clusters![0].key).toBe('paired-mirror');
  });

  it('matches 3 cultivars with similar counts', () => {
    const input = makeInput([
      { cultivarId: 'a', count: 4, footprintIn: 8, heightIn: null },
      { cultivarId: 'b', count: 5, footprintIn: 8, heightIn: null },
      { cultivarId: 'c', count: 3, footprintIn: 8, heightIn: null },
    ]);
    expect(pairedMirrorPartitioner(input)).not.toBeNull();
  });

  it('matches across categories — pair-mirroring trumps category split', () => {
    const input = makeInput([
      { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, category: 'vegetables' },
      { cultivarId: 'basil', count: 4, footprintIn: 6, heightIn: null, category: 'herbs' },
    ]);
    const clusters = pairedMirrorPartitioner(input);
    expect(clusters).not.toBeNull();
    expect(clusters![0].plants.length).toBe(2);
  });

  it('falls through (null) when there are 4+ cultivars', () => {
    const input = makeInput([
      { cultivarId: 'a', count: 4, footprintIn: 8, heightIn: null },
      { cultivarId: 'b', count: 4, footprintIn: 8, heightIn: null },
      { cultivarId: 'c', count: 4, footprintIn: 8, heightIn: null },
      { cultivarId: 'd', count: 4, footprintIn: 8, heightIn: null },
    ]);
    expect(pairedMirrorPartitioner(input)).toBeNull();
  });

  it('falls through (null) on lopsided counts (8 + 1)', () => {
    const input = makeInput([
      { cultivarId: 'a', count: 8, footprintIn: 8, heightIn: null },
      { cultivarId: 'b', count: 1, footprintIn: 8, heightIn: null },
    ]);
    expect(pairedMirrorPartitioner(input)).toBeNull();
  });

  it('falls through (null) on a single cultivar (homogeneous-bypass case)', () => {
    const input = makeInput([
      { cultivarId: 'a', count: 8, footprintIn: 8, heightIn: null },
    ]);
    expect(pairedMirrorPartitioner(input)).toBeNull();
  });
});
