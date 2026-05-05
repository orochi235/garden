import { describe, it, expect } from 'vitest';
import { greedyHexPack } from './seed';
import type { OptimizationInput } from './types';
import { DEFAULT_WEIGHTS } from './types';

const baseInput: OptimizationInput = {
  bed: { widthIn: 48, lengthIn: 96, trellisEdge: null, edgeClearanceIn: 0 },
  plants: [
    { cultivarId: 'tomato', count: 3, footprintIn: 18, heightIn: 60, climber: false },
    { cultivarId: 'basil', count: 6, footprintIn: 8, heightIn: 12, climber: false },
  ],
  weights: DEFAULT_WEIGHTS,
  gridResolutionIn: 4,
  companions: { pairs: {} },
  userRegions: [],
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
});
