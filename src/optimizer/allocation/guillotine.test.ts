import { describe, it, expect } from 'vitest';
import { guillotineAllocator } from './guillotine';
import type { Cluster, OptimizerBed } from '../types';

function makeCluster(key: string, footprintIn: number, count: number): Cluster {
  return {
    key,
    plants: [
      { cultivarId: `c-${key}`, count, footprintIn, heightIn: null, category: key },
    ],
  };
}

describe('guillotineAllocator', () => {
  it('returns the whole bed for a single cluster', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, edgeClearanceIn: 0 };
    const subBeds = guillotineAllocator(bed, [makeCluster('a', 12, 4)]);
    expect(subBeds).toHaveLength(1);
    expect(subBeds[0].bed.widthIn).toBe(48);
    expect(subBeds[0].bed.lengthIn).toBe(96);
    expect(subBeds[0].offsetIn).toEqual({ x: 0, y: 0 });
  });

  it('partitions are non-overlapping and tile the bed (no remainder)', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, edgeClearanceIn: 0 };
    const subBeds = guillotineAllocator(bed, [
      makeCluster('a', 18, 9),
      makeCluster('b', 12, 4),
      makeCluster('c', 8, 2),
    ]);
    const totalArea = subBeds.reduce((s, sb) => s + sb.bed.widthIn * sb.bed.lengthIn, 0);
    expect(totalArea).toBeCloseTo(48 * 96, 3);
  });

  it('drops smallest cluster when its sqrt-area share is below min strip', () => {
    // Big cluster overwhelms; tiny cluster's sub-area share is tiny → dropped.
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, edgeClearanceIn: 2 };
    const subBeds = guillotineAllocator(bed, [
      makeCluster('big', 18, 16),
      makeCluster('tiny', 6, 1),
    ]);
    expect(subBeds.length).toBe(1);
    expect(subBeds[0].cluster.key).toBe('big');
  });

  it('cuts along the longer axis', () => {
    // Bed is wider than tall (length > width).
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, edgeClearanceIn: 0 };
    const subBeds = guillotineAllocator(bed, [
      makeCluster('a', 12, 8),
      makeCluster('b', 12, 4),
    ]);
    // First cut along long axis: both pieces share full short-axis width.
    expect(subBeds[0].bed.widthIn).toBeCloseTo(48, 5);
    expect(subBeds[1].bed.widthIn).toBeCloseTo(48, 5);
  });
});
