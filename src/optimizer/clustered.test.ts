import { describe, it, expect } from 'vitest';
import { familyCompanionPartitioner } from './partitioning/familyCompanion';
import { proportionalStripAllocator } from './allocation/proportionalStrip';
import { estimatePlacementVars } from './formulation';
import { DEFAULT_WEIGHTS, type OptimizationInput, type OptimizerPlant } from './types';

// Verifies the wiring contract that solveClustered relies on, without
// invoking the worker (which requires a real Web Worker + HiGHS-WASM).
// The end-to-end MILP solve is exercised by runOptimizer.test.ts already.

describe('clustered pipeline wiring', () => {
  it('estimates above the threshold for a many-plant input', () => {
    const plants: OptimizerPlant[] = [
      { cultivarId: 'tomato', count: 6, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
      { cultivarId: 'pepper', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
      { cultivarId: 'basil', count: 8, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
      { cultivarId: 'thyme', count: 4, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
    ];
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 },
      plants,
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs: {} },
      userRegions: [], timeLimitSec: 5, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    expect(estimatePlacementVars(input)).toBeGreaterThan(500);
  });

  it('partitions and allocates produce non-overlapping covering sub-beds', () => {
    const plants: OptimizerPlant[] = [
      { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
      { cultivarId: 'basil', count: 8, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
    ];
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 },
      plants,
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs: {} },
      userRegions: [], timeLimitSec: 5, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    const clusters = familyCompanionPartitioner(input);
    const subBeds = proportionalStripAllocator(input.bed, clusters);
    expect(subBeds.length).toBe(2);
    const sortedY = subBeds
      .map((sb) => ({ start: sb.offsetIn.y, end: sb.offsetIn.y + sb.bed.lengthIn }))
      .sort((a, b) => a.start - b.start);
    expect(sortedY[0].start).toBe(0);
    expect(sortedY[0].end).toBeCloseTo(sortedY[1].start, 5);
    expect(sortedY[1].end).toBeCloseTo(96, 5);
  });

  it('one-cluster input falls back to a single sub-bed equal to the parent', () => {
    const plants: OptimizerPlant[] = [
      { cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
    ];
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 },
      plants,
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs: {} },
      userRegions: [], timeLimitSec: 5, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    const clusters = familyCompanionPartitioner(input);
    const subBeds = proportionalStripAllocator(input.bed, clusters);
    expect(subBeds.length).toBe(1);
    expect(subBeds[0].bed.widthIn).toBe(input.bed.widthIn);
    expect(subBeds[0].bed.lengthIn).toBe(input.bed.lengthIn);
    expect(subBeds[0].offsetIn).toEqual({ x: 0, y: 0 });
  });
});
