import { describe, it, expect } from 'vitest';
import { proportionalStripAllocator } from './proportionalStrip';
import type { Cluster, OptimizerBed } from '../types';

function makeCluster(key: string, footprintIn: number, count: number, climbers = 0): Cluster {
  const plants = [
    { cultivarId: `c-${key}`, count, footprintIn, heightIn: null, climber: false, category: key },
  ];
  if (climbers > 0) {
    plants.push({ cultivarId: `cl-${key}`, count: climbers, footprintIn, heightIn: null, climber: true, category: key });
  }
  return {
    key,
    plants,
    climberCount: climbers,
  };
}

describe('proportionalStripAllocator', () => {
  it('returns the whole bed unchanged for a single cluster', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 };
    const subBeds = proportionalStripAllocator(bed, [makeCluster('a', 12, 4)]);
    expect(subBeds.length).toBe(1);
    expect(subBeds[0].bed.widthIn).toBe(48);
    expect(subBeds[0].bed.lengthIn).toBe(96);
    expect(subBeds[0].offsetIn).toEqual({ x: 0, y: 0 });
  });

  it('splits along the long axis with no trellis', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 };
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

  it('places climber-containing clusters adjacent to the trellis edge', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, trellis: { kind: 'edge', edge: 'N' }, edgeClearanceIn: 0 };
    const noClimbers = makeCluster('veggies', 12, 4);
    const withClimbers = makeCluster('legumes', 12, 4, 2);
    const subBeds = proportionalStripAllocator(bed, [noClimbers, withClimbers]);
    expect(subBeds.length).toBe(2);
    const climberSub = subBeds.find((sb) => sb.cluster.key === 'legumes')!;
    const veggieSub = subBeds.find((sb) => sb.cluster.key === 'veggies')!;
    expect(climberSub.offsetIn.y).toBe(0);
    expect(climberSub.bed.trellis).toEqual({ kind: 'edge', edge: 'N' });
    expect(veggieSub.bed.trellis).toBeNull();
  });

  it('proportions strip widths by total footprint area', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 };
    const subBeds = proportionalStripAllocator(bed, [
      makeCluster('big', 12, 4),
      makeCluster('small', 6, 4),
    ]);
    const big = subBeds.find((sb) => sb.cluster.key === 'big')!;
    const small = subBeds.find((sb) => sb.cluster.key === 'small')!;
    expect(big.bed.lengthIn).toBeGreaterThan(small.bed.lengthIn);
    expect(big.bed.lengthIn + small.bed.lengthIn).toBeCloseTo(96, 5);
  });

  it('rejects trellis line (interior trellis not supported in v1)', () => {
    const bed: OptimizerBed = {
      widthIn: 48, lengthIn: 96,
      trellis: { kind: 'line', orientation: 'horizontal', offsetIn: 48 },
      edgeClearanceIn: 0,
    };
    expect(() => proportionalStripAllocator(bed, [makeCluster('a', 12, 4)])).toThrow(/interior trellis/i);
  });
});
