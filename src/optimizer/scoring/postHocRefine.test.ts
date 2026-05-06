import { describe, it, expect } from 'vitest';
import { refineClusterLayout, type RefineInput } from './postHocRefine';
import type { OptimizerPlacement, OptimizerPlant } from '../types';

describe('refineClusterLayout', () => {
  // Two clusters in adjacent strips. Cluster A holds tall plants (heightIn 72),
  // cluster B holds short plants (heightIn 12). The clustered solver placed
  // them with the tall cluster's plants right next to the short cluster's
  // plants along the seam — high cross-cluster shading penalty. A 180° rotate
  // of cluster A pushes its plants to the far side, away from cluster B.
  it('reduces cross-cluster penalty via rotation when initial layout is bad', () => {
    // 48-wide × 96-long bed. Strip A: y in [0, 48]. Strip B: y in [48, 96].
    // ADJACENCY_IN = 24, so plants on opposite sides of the seam within ~24in
    // contribute pairwise penalty.
    const plants: OptimizerPlant[] = [
      { cultivarId: 'tall', count: 2, footprintIn: 8, heightIn: 72 },
      { cultivarId: 'short', count: 2, footprintIn: 8, heightIn: 12 },
    ];
    // Cluster A (tall) lives in strip y∈[0,48]; placements clustered near
    // y=44 (close to the seam at y=48). After 180° rotation about strip
    // center (y=24), they flip to y=4 — far from the seam.
    const placements: OptimizerPlacement[] = [
      // Cluster 0 (tall): near seam.
      { cultivarId: 'tall', xIn: 12, yIn: 44 },
      { cultivarId: 'tall', xIn: 36, yIn: 44 },
      // Cluster 1 (short): also near seam (y=52, just inside strip B).
      { cultivarId: 'short', xIn: 12, yIn: 52 },
      { cultivarId: 'short', xIn: 36, yIn: 52 },
    ];
    const placementClusterIdx = [0, 0, 1, 1];
    const regions = [
      { key: 'A', offsetIn: { x: 0, y: 0 }, widthIn: 48, lengthIn: 48 },
      { key: 'B', offsetIn: { x: 0, y: 48 }, widthIn: 48, lengthIn: 48 },
    ];
    const footprintByCultivar = new Map<string, number>([
      ['tall', 8], ['short', 8],
    ]);
    const input: RefineInput = {
      placements,
      placementClusterIdx,
      regions,
      plants,
      weights: { shading: 1, sameSpeciesBuffer: 1 },
      footprintByCultivar,
    };

    const out = refineClusterLayout(input);

    // Initial: tall@(12,44) ↔ short@(12,52) distance 8 (< 24) → shading penalty.
    //          tall@(36,44) ↔ short@(36,52) distance 8 (< 24) → shading penalty.
    // After rotating A 180° about center (24,24): tall plants go to y=4.
    //   tall@(36,4) ↔ short@(12,52) distance hypot(24,48)≈53.7 → 0.
    //   etc. → all cross pairs > 24in → score 0.
    expect(out.initialCrossClusterScore).toBeLessThan(0);
    expect(out.finalCrossClusterScore).toBeGreaterThan(out.initialCrossClusterScore);
    expect(out.acceptedMoves).toBeGreaterThan(0);
    // Cluster A's plants should now be on the far (north) side: y < 24.
    const tallY = out.placements
      .filter((_, i) => out.placementClusterIdx[i] === 0)
      .map((p) => p.yIn);
    expect(tallY.every((y) => y < 24)).toBe(true);
  });

  it('is a no-op when initial layout is already good', () => {
    const plants: OptimizerPlant[] = [
      { cultivarId: 'tall', count: 1, footprintIn: 8, heightIn: 72 },
      { cultivarId: 'short', count: 1, footprintIn: 8, heightIn: 12 },
    ];
    const placements: OptimizerPlacement[] = [
      { cultivarId: 'tall', xIn: 12, yIn: 4 },     // far from seam
      { cultivarId: 'short', xIn: 12, yIn: 92 },   // far from seam
    ];
    const input: RefineInput = {
      placements,
      placementClusterIdx: [0, 1],
      regions: [
        { key: 'A', offsetIn: { x: 0, y: 0 }, widthIn: 48, lengthIn: 48 },
        { key: 'B', offsetIn: { x: 0, y: 48 }, widthIn: 48, lengthIn: 48 },
      ],
      plants,
      weights: { shading: 1, sameSpeciesBuffer: 1 },
      footprintByCultivar: new Map([['tall', 8], ['short', 8]]),
    };
    const out = refineClusterLayout(input);
    expect(out.initialCrossClusterScore).toBe(0);
    expect(out.finalCrossClusterScore).toBe(0);
    expect(out.acceptedMoves).toBe(0);
  });

  it('honors the time bound', () => {
    // Large input with many clusters; force the clock to advance fast so the
    // refine pass times out early.
    const plants: OptimizerPlant[] = Array.from({ length: 6 }, (_, i) => ({
      cultivarId: `c${i}`, count: 2, footprintIn: 8, heightIn: 12 + i * 10,
    }));
    const placements: OptimizerPlacement[] = [];
    const placementClusterIdx: number[] = [];
    const regions: RefineInput['regions'] = [];
    for (let ci = 0; ci < 6; ci++) {
      regions.push({
        key: `c${ci}`,
        offsetIn: { x: 0, y: ci * 16 },
        widthIn: 48,
        lengthIn: 16,
      });
      placements.push({ cultivarId: `c${ci}`, xIn: 12, yIn: ci * 16 + 8 });
      placements.push({ cultivarId: `c${ci}`, xIn: 36, yIn: ci * 16 + 8 });
      placementClusterIdx.push(ci, ci);
    }
    let t = 0;
    const out = refineClusterLayout({
      placements,
      placementClusterIdx,
      regions,
      plants,
      weights: { shading: 1, sameSpeciesBuffer: 1 },
      footprintByCultivar: new Map(plants.map((p) => [p.cultivarId, 8])),
      now: () => { t += 25; return t; },  // each tick advances 25ms — second check exceeds 50ms
    });
    expect(out.timedOut).toBe(true);
  });
});
