import { describe, it, expect } from 'vitest';
import { greedyHexPack } from './seed';
import type { OptimizationInput } from './types';
import { DEFAULT_WEIGHTS } from './types';

const baseInput: OptimizationInput = {
  bed: { widthIn: 48, lengthIn: 96, edgeClearanceIn: 0 },
  plants: [
    { cultivarId: 'tomato', count: 3, footprintIn: 18, heightIn: 60 },
    { cultivarId: 'basil', count: 6, footprintIn: 8, heightIn: 12 },
  ],
  weights: DEFAULT_WEIGHTS,
  gridResolutionIn: 4,
  timeLimitSec: 5,
  mipGap: 0.01,
  candidateCount: 1,
  diversityThreshold: 3,
};

describe('greedyHexPack', () => {
  it('places every plant when bed has room', () => {
    const seed = greedyHexPack(baseInput);
    expect(seed.length).toBe(3 + 6);
  });

  it('places larger plants first', () => {
    const seed = greedyHexPack(baseInput);
    const tomatoes = seed.filter((p) => p.cultivarId === 'tomato');
    const basils = seed.filter((p) => p.cultivarId === 'basil');
    expect(tomatoes.every((t) => basils.every((b) => t.placedAt <= b.placedAt))).toBe(true);
  });

  it('produces non-overlapping placements (footprint check)', () => {
    const seed = greedyHexPack(baseInput);
    for (let i = 0; i < seed.length; i++) {
      for (let j = i + 1; j < seed.length; j++) {
        const dx = seed[i].xIn - seed[j].xIn;
        const dy = seed[i].yIn - seed[j].yIn;
        const minDist = (seed[i].footprintIn + seed[j].footprintIn) / 2;
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(minDist - 0.001);
      }
    }
  });

  it('preserves existingPlacements at original coordinates and packs the rest', () => {
    // Request 6 basils total; preserve 2 at quirky non-grid positions.
    const input: OptimizationInput = {
      ...baseInput,
      plants: [{ cultivarId: 'basil', count: 6, footprintIn: 8, heightIn: 12 }],
      existingPlacements: [
        { cultivarId: 'basil', xIn: 7, yIn: 11 },
        { cultivarId: 'basil', xIn: 23, yIn: 35 },
      ],
    };
    const seed = greedyHexPack(input);
    expect(seed.length).toBe(6);
    // Two preserved placements appear first with their exact original coords.
    expect(seed[0]).toMatchObject({ cultivarId: 'basil', xIn: 7, yIn: 11 });
    expect(seed[1]).toMatchObject({ cultivarId: 'basil', xIn: 23, yIn: 35 });
    // Remaining four don't collide with preserved ones (or each other).
    for (let i = 0; i < seed.length; i++) {
      for (let j = i + 1; j < seed.length; j++) {
        const dx = seed[i].xIn - seed[j].xIn;
        const dy = seed[i].yIn - seed[j].yIn;
        const minDist = (seed[i].spacingIn + seed[j].spacingIn) / 2;
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(minDist - 0.001);
      }
    }
    // None of the new four sit at a preserved coord.
    const newOnes = seed.slice(2);
    for (const p of newOnes) {
      expect(!(p.xIn === 7 && p.yIn === 11)).toBe(true);
      expect(!(p.xIn === 23 && p.yIn === 35)).toBe(true);
    }
  });

  it('drops overlapping existingPlacements (first-wins)', () => {
    const input: OptimizationInput = {
      ...baseInput,
      plants: [{ cultivarId: 'basil', count: 6, footprintIn: 8, heightIn: 12 }],
      existingPlacements: [
        { cultivarId: 'basil', xIn: 10, yIn: 10 },
        { cultivarId: 'basil', xIn: 11, yIn: 11 }, // overlaps the first
      ],
    };
    const seed = greedyHexPack(input);
    // First preserved survives at (10,10); second is dropped.
    expect(seed[0]).toMatchObject({ xIn: 10, yIn: 10 });
    const second = seed.find((p) => p.xIn === 11 && p.yIn === 11);
    expect(second).toBeUndefined();
  });

  it('ignores existingPlacements with cultivars not in request', () => {
    const input: OptimizationInput = {
      ...baseInput,
      plants: [{ cultivarId: 'basil', count: 3, footprintIn: 8, heightIn: 12 }],
      existingPlacements: [
        { cultivarId: 'mystery', xIn: 10, yIn: 10 },
      ],
    };
    const seed = greedyHexPack(input);
    expect(seed.every((p) => p.cultivarId === 'basil')).toBe(true);
    expect(seed.length).toBe(3);
  });
});
