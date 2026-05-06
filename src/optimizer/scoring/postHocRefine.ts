/**
 * Post-hoc cluster rotation/swap pass for the clustered solver.
 *
 * The clustered solver optimizes each sub-bed independently, so cross-cluster
 * plant pairs cannot influence the MIP objective. After all clusters are
 * solved, two cheap rigid-body transforms can reduce the cross-cluster
 * penalty (= improve the diagnostic `crossClusterScore`) without touching the
 * within-cluster objective:
 *
 *   1. ROTATION: rotate a cluster's placements 90/180/270° within its allotted
 *      sub-bed. The within-cluster pairwise structure is preserved exactly
 *      (rigid transform → all intra-cluster distances unchanged), so the only
 *      effect is to push cross-cluster pairs into / out of `ADJACENCY_IN`
 *      proximity.
 *   2. SWAP: exchange which sub-rectangle two clusters occupy. Each cluster
 *      keeps its placements' positions relative to its own sub-bed origin.
 *      Same invariant as rotation w/r/t within-cluster scoring.
 *
 * Both passes use a hill-climb that accepts any change improving the total
 * cross-cluster score, time-bounded at `MAX_REFINE_MS` ms total.
 *
 * Constraints:
 *   - Cluster placements must remain inside their (post-swap, post-rotation)
 *     sub-bed bounds. Transforms that don't fit are skipped.
 *   - This module is dependency-free w/r/t project types — `src/optimizer/`
 *     is extracted to a standalone package.
 */
import { pairContribution } from './pairwiseScore';
import type {
  OptimizerPlacement, OptimizerPlant, OptimizerWeights,
} from '../types';

export const MAX_REFINE_MS = 50;

export interface ClusterRegion {
  key: string;
  offsetIn: { x: number; y: number };
  widthIn: number;
  lengthIn: number;
}

export interface RefineInput {
  placements: OptimizerPlacement[];
  /** Per-placement cluster index (parallel to `placements`). */
  placementClusterIdx: number[];
  /** Sub-bed rectangles, indexed by cluster index. */
  regions: ClusterRegion[];
  plants: OptimizerPlant[];
  weights: OptimizerWeights;
  /** Per-placement footprint diameter (used for in-bounds checks). */
  footprintByCultivar: Map<string, number>;
  /** Override clock for tests. Defaults to performance.now. */
  now?: () => number;
}

export interface RefineOutput {
  placements: OptimizerPlacement[];
  placementClusterIdx: number[];
  regions: ClusterRegion[];
  /** Cross-cluster score before any refinement. */
  initialCrossClusterScore: number;
  /** Cross-cluster score after refinement. */
  finalCrossClusterScore: number;
  /** Number of accepted rotation/swap moves. */
  acceptedMoves: number;
  /** True if the time bound was hit before the hill-climb converged. */
  timedOut: boolean;
}

export function refineClusterLayout(input: RefineInput): RefineOutput {
  const now = input.now ?? (() => performance.now());
  const start = now();
  const placements = input.placements.map((p) => ({ ...p }));
  const clusterIdx = input.placementClusterIdx.slice();
  const regions = input.regions.map((r) => ({
    ...r,
    offsetIn: { ...r.offsetIn },
  }));
  const heightByCultivar = buildHeightByCultivar(input.plants);

  const initialCrossClusterScore = computeCrossClusterScore(
    placements, clusterIdx, heightByCultivar, input.weights,
  );

  let acceptedMoves = 0;
  let timedOut = false;
  let improved = true;

  // Hill-climb: repeat until no move improves or time budget exhausted.
  // Each pass tries every rotation, then every pairwise swap. Greedy:
  // accept the first improving move within each pass.
  while (improved) {
    improved = false;
    if (now() - start > MAX_REFINE_MS) { timedOut = true; break; }

    // ROTATION pass.
    for (let ci = 0; ci < regions.length; ci++) {
      if (now() - start > MAX_REFINE_MS) { timedOut = true; break; }
      const before = computeCrossClusterScore(
        placements, clusterIdx, heightByCultivar, input.weights,
      );
      let bestDelta = 0;
      let bestRotated: OptimizerPlacement[] | null = null;
      const memberIdxs = collectMembers(clusterIdx, ci);
      for (const angle of [90, 180, 270] as const) {
        const rotated = tryRotateCluster(
          placements, memberIdxs, regions[ci], angle, input.footprintByCultivar,
        );
        if (!rotated) continue;
        const candidate = placements.map((p, i) => rotated.get(i) ?? p);
        const after = computeCrossClusterScore(
          candidate, clusterIdx, heightByCultivar, input.weights,
        );
        const delta = after - before;
        if (delta > bestDelta + 1e-9) {
          bestDelta = delta;
          bestRotated = candidate;
        }
      }
      if (bestRotated) {
        for (let i = 0; i < placements.length; i++) {
          placements[i] = bestRotated[i];
        }
        acceptedMoves++;
        improved = true;
      }
    }

    if (timedOut) break;

    // SWAP pass.
    for (let a = 0; a < regions.length; a++) {
      if (now() - start > MAX_REFINE_MS) { timedOut = true; break; }
      for (let b = a + 1; b < regions.length; b++) {
        if (now() - start > MAX_REFINE_MS) { timedOut = true; break; }
        const before = computeCrossClusterScore(
          placements, clusterIdx, heightByCultivar, input.weights,
        );
        const swap = trySwapClusters(
          placements, clusterIdx, regions, a, b, input.footprintByCultivar,
        );
        if (!swap) continue;
        const after = computeCrossClusterScore(
          swap.placements, clusterIdx, heightByCultivar, input.weights,
        );
        if (after - before > 1e-9) {
          for (let i = 0; i < placements.length; i++) {
            placements[i] = swap.placements[i];
          }
          regions[a] = swap.regions[a];
          regions[b] = swap.regions[b];
          acceptedMoves++;
          improved = true;
        }
      }
    }
  }

  const finalCrossClusterScore = computeCrossClusterScore(
    placements, clusterIdx, heightByCultivar, input.weights,
  );
  return {
    placements,
    placementClusterIdx: clusterIdx,
    regions,
    initialCrossClusterScore,
    finalCrossClusterScore,
    acceptedMoves,
    timedOut,
  };
}

function buildHeightByCultivar(plants: OptimizerPlant[]): Map<string, number | null> {
  const m = new Map<string, number | null>();
  for (const p of plants) if (!m.has(p.cultivarId)) m.set(p.cultivarId, p.heightIn);
  return m;
}

function collectMembers(clusterIdx: number[], ci: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < clusterIdx.length; i++) if (clusterIdx[i] === ci) out.push(i);
  return out;
}

/**
 * Rotate a cluster's placements about the center of its sub-bed by
 * 90/180/270°. Returns a Map of placement-index → rotated placement, or
 * `null` if the rotation puts any plant outside the sub-bed bounds.
 *
 * For 90/270° rotations, the cluster's bounding box swaps width/height —
 * we still require it to fit inside the (unchanged) sub-bed.
 */
function tryRotateCluster(
  placements: OptimizerPlacement[],
  memberIdxs: number[],
  region: ClusterRegion,
  angle: 90 | 180 | 270,
  footprintByCultivar: Map<string, number>,
): Map<number, OptimizerPlacement> | null {
  // Convert to local (sub-bed) coordinates, rotate around sub-bed center,
  // then convert back to bed coordinates.
  const cx = region.widthIn / 2;
  const cy = region.lengthIn / 2;
  const rotated = new Map<number, OptimizerPlacement>();
  for (const idx of memberIdxs) {
    const p = placements[idx];
    const lx = p.xIn - region.offsetIn.x;
    const ly = p.yIn - region.offsetIn.y;
    const dx = lx - cx;
    const dy = ly - cy;
    let nx: number;
    let ny: number;
    if (angle === 90) { nx = cx - dy; ny = cy + dx; }
    else if (angle === 180) { nx = cx - dx; ny = cy - dy; }
    else { nx = cx + dy; ny = cy - dx; }
    // For 90/270, sub-bed is rectangular not square — we rotated around
    // the center of an `widthIn × lengthIn` box, so the rotated point may
    // fall outside [0, widthIn] × [0, lengthIn]. The bounds check below
    // catches that.
    const fp = footprintByCultivar.get(p.cultivarId) ?? 0;
    const r = fp / 2;
    if (nx - r < 0 || nx + r > region.widthIn) return null;
    if (ny - r < 0 || ny + r > region.lengthIn) return null;
    rotated.set(idx, {
      cultivarId: p.cultivarId,
      xIn: nx + region.offsetIn.x,
      yIn: ny + region.offsetIn.y,
    });
  }
  return rotated;
}

/**
 * Swap which sub-rectangle clusters `a` and `b` occupy. Each cluster keeps
 * its placements relative to its own sub-bed's local origin. Returns the
 * new placements/regions, or `null` if either cluster's footprint doesn't
 * fit in the other's sub-bed.
 */
function trySwapClusters(
  placements: OptimizerPlacement[],
  clusterIdx: number[],
  regions: ClusterRegion[],
  a: number,
  b: number,
  footprintByCultivar: Map<string, number>,
): { placements: OptimizerPlacement[]; regions: ClusterRegion[] } | null {
  const ra = regions[a];
  const rb = regions[b];
  const newPlacements = placements.slice();
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    const ci = clusterIdx[i];
    if (ci !== a && ci !== b) continue;
    const fromRegion = ci === a ? ra : rb;
    const toRegion = ci === a ? rb : ra;
    const lx = p.xIn - fromRegion.offsetIn.x;
    const ly = p.yIn - fromRegion.offsetIn.y;
    const fp = footprintByCultivar.get(p.cultivarId) ?? 0;
    const r = fp / 2;
    if (lx - r < 0 || lx + r > toRegion.widthIn) return null;
    if (ly - r < 0 || ly + r > toRegion.lengthIn) return null;
    newPlacements[i] = {
      cultivarId: p.cultivarId,
      xIn: lx + toRegion.offsetIn.x,
      yIn: ly + toRegion.offsetIn.y,
    };
  }
  // After the swap, each cluster occupies the OTHER cluster's full sub-bed
  // (offset + dims). The placements were translated into the destination
  // region's local frame; the bounds checks above ensured they fit inside
  // `toRegion.widthIn × toRegion.lengthIn`.
  const newRegions = regions.slice();
  newRegions[a] = { key: ra.key, offsetIn: { ...rb.offsetIn }, widthIn: rb.widthIn, lengthIn: rb.lengthIn };
  newRegions[b] = { key: rb.key, offsetIn: { ...ra.offsetIn }, widthIn: ra.widthIn, lengthIn: ra.lengthIn };
  return { placements: newPlacements, regions: newRegions };
}

function computeCrossClusterScore(
  placements: OptimizerPlacement[],
  clusterIdx: number[],
  heightByCultivar: Map<string, number | null>,
  weights: OptimizerWeights,
): number {
  let total = 0;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (clusterIdx[i] === clusterIdx[j]) continue;
      const a = {
        cultivarId: placements[i].cultivarId,
        heightIn: heightByCultivar.get(placements[i].cultivarId) ?? null,
      };
      const b = {
        cultivarId: placements[j].cultivarId,
        heightIn: heightByCultivar.get(placements[j].cultivarId) ?? null,
      };
      total += pairContribution(
        a, { xIn: placements[i].xIn, yIn: placements[i].yIn },
        b, { xIn: placements[j].xIn, yIn: placements[j].yIn },
        weights,
      );
    }
  }
  return total;
}
