import { describe, it, expect } from 'vitest';
import { adaptiveAllocator, GUILLOTINE_THRESHOLD } from './adaptive';
import { proportionalStripAllocator } from './proportionalStrip';
import type { Cluster, OptimizerBed } from '../types';

function makeCluster(key: string, footprintIn: number, count: number): Cluster {
  return {
    key,
    plants: [
      { cultivarId: `c-${key}`, count, footprintIn, heightIn: null, category: key },
    ],
  };
}

describe('adaptiveAllocator', () => {
  it('equal-area clusters → strips (matches proportional-strip output)', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, edgeClearanceIn: 0 };
    const clusters = [
      makeCluster('a', 12, 4),
      makeCluster('b', 12, 4),
    ];
    const adaptive = adaptiveAllocator(bed, clusters);
    const strips = proportionalStripAllocator(bed, clusters);
    expect(adaptive.length).toBe(strips.length);
    for (let i = 0; i < adaptive.length; i++) {
      expect(adaptive[i].cluster.key).toBe(strips[i].cluster.key);
      expect(adaptive[i].bed.widthIn).toBeCloseTo(strips[i].bed.widthIn, 5);
      expect(adaptive[i].bed.lengthIn).toBeCloseTo(strips[i].bed.lengthIn, 5);
      expect(adaptive[i].offsetIn.x).toBeCloseTo(strips[i].offsetIn.x, 5);
      expect(adaptive[i].offsetIn.y).toBeCloseTo(strips[i].offsetIn.y, 5);
    }
  });

  it('skewed-area clusters → guillotine; large cluster gets a sane aspect ratio', () => {
    // Square bed, three clusters with skewed areas — big ~50%, two smalls ~25% each.
    // Ratio big/small ~4 → triggers guillotine. In a strip allocator the big
    // cluster would get half the long axis and a 48×24 sub-bed (aspect 2.0);
    // guillotine's "cut on axis that minimizes anchor aspect" should give
    // the big cluster a roughly square chunk.
    const bed: OptimizerBed = { widthIn: 96, lengthIn: 96, edgeClearanceIn: 2 };
    const clusters = [
      makeCluster('big', 12, 8),
      makeCluster('m1', 8, 2),
      makeCluster('m2', 8, 2),
    ];
    const subBeds = adaptiveAllocator(bed, clusters);
    const big = subBeds.find((s) => s.cluster.key === 'big');
    expect(big).toBeTruthy();
    if (!big) return;

    const aspect = Math.max(big.bed.widthIn, big.bed.lengthIn)
      / Math.min(big.bed.widthIn, big.bed.lengthIn);
    // Strip allocator on a square bed with these areas would give aspect ~1.45+;
    // guillotine should be at or under that. Assert noticeably better than 1.5.
    expect(aspect).toBeLessThan(1.5);

    // Sanity: tile fully, no overlap (sum of sub-bed areas = bed area).
    const totalArea = subBeds.reduce((s, sb) => s + sb.bed.widthIn * sb.bed.lengthIn, 0);
    expect(totalArea).toBeCloseTo(96 * 96, 3);
  });

  it('exposes a threshold constant', () => {
    expect(GUILLOTINE_THRESHOLD).toBeGreaterThan(1);
  });
});
