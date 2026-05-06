import { describe, it, expect } from 'vitest';
import { proportionalStripAllocator } from './proportionalStrip';
import type { Cluster, OptimizerBed } from '../types';

function makeCluster(key: string, footprintIn: number, count: number): Cluster {
  const plants = [
    { cultivarId: `c-${key}`, count, footprintIn, heightIn: null, category: key },
  ];
  return {
    key,
    plants,
  };
}

describe('proportionalStripAllocator', () => {
  it('returns the whole bed unchanged for a single cluster', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, edgeClearanceIn: 0 };
    const subBeds = proportionalStripAllocator(bed, [makeCluster('a', 12, 4)]);
    expect(subBeds.length).toBe(1);
    expect(subBeds[0].bed.widthIn).toBe(48);
    expect(subBeds[0].bed.lengthIn).toBe(96);
    expect(subBeds[0].offsetIn).toEqual({ x: 0, y: 0 });
  });

  it('splits along the long axis', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, edgeClearanceIn: 0 };
    const subBeds = proportionalStripAllocator(bed, [
      makeCluster('a', 12, 4),
      makeCluster('b', 12, 4),
    ]);
    expect(subBeds.length).toBe(2);
    expect(subBeds[0].bed.widthIn).toBe(48);
    expect(subBeds[1].bed.widthIn).toBe(48);
    const totalLen = subBeds[0].bed.lengthIn + subBeds[1].bed.lengthIn;
    expect(totalLen).toBeCloseTo(96, 5);
    expect(subBeds[1].offsetIn.y).toBeCloseTo(subBeds[0].bed.lengthIn, 5);
  });

  it('proportions strip widths by total footprint area', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, edgeClearanceIn: 0 };
    const subBeds = proportionalStripAllocator(bed, [
      makeCluster('big', 12, 4),
      makeCluster('small', 6, 4),
    ]);
    const big = subBeds.find((sb) => sb.cluster.key === 'big')!;
    const small = subBeds.find((sb) => sb.cluster.key === 'small')!;
    expect(big.bed.lengthIn).toBeGreaterThan(small.bed.lengthIn);
    expect(big.bed.lengthIn + small.bed.lengthIn).toBeCloseTo(96, 5);
  });
});
