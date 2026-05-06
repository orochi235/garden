/**
 * Public API for the bed-layout optimizer.
 *
 * This module is designed for extraction to a standalone npm package. It MUST NOT
 * import any project types — only plain numbers, strings, and arrays.
 */

export interface OptimizerBed {
  /** Bed width along the X axis, in inches. */
  widthIn: number;
  /** Bed length along the Y axis, in inches. */
  lengthIn: number;
  /** Per-edge clearance, inches. Default 0. */
  edgeClearanceIn: number;
}

export interface OptimizerPlant {
  /** Stable id; the optimizer treats each `count` copy as interchangeable. */
  cultivarId: string;
  /** How many of this plant the user wants to fit. */
  count: number;
  /** Footprint diameter in inches (visual size at maturity). */
  footprintIn: number;
  /** Recommended center-to-center spacing in inches. Falls back to footprintIn. */
  spacingIn?: number;
  /** Mature height in inches. Used by the sun-shading term. */
  heightIn: number | null;
  /** Plant category for clustering (e.g. 'vegetables', 'herbs'). Optional. */
  category?: string;
}

export interface OptimizerWeights {
  /** All weights are unitless multipliers, default 1.0. Set to 0 to disable a term. */
  shading: number;
  sameSpeciesBuffer: number;
}

export interface OptimizationInput {
  bed: OptimizerBed;
  plants: OptimizerPlant[];
  weights: OptimizerWeights;
  /** Cell size for discretization, inches. Default 4. */
  gridResolutionIn: number;
  /** Maximum solve time per candidate, seconds. */
  timeLimitSec: number;
  /** MIP optimality gap tolerance (0.01 = 1%). */
  mipGap: number;
  /** Number of candidates to return (1–3). */
  candidateCount: number;
  /** Minimum-difference threshold between candidates (cells, default 3). */
  diversityThreshold: number;
  /**
   * Maximum number of Web Workers the runner may spawn in parallel. The runner
   * partitions the candidate batch across this many workers
   * (`ceil(candidateCount / N)` candidates per worker). Default 1 — identical
   * to legacy single-worker behavior.
   *
   * Note: when N > 1, no-good-cut diversity chains are independent within each
   * sub-batch — workers cannot see each other's prior active vars. Set to 1 if
   * cross-candidate diversity matters more than wall-clock.
   */
  concurrency?: number;
  /**
   * Hint to the greedy fallback: placements to preserve (with original
   * coordinates) when packing. Only consumed when the optimizer falls back to
   * `greedyHexPack` — MILP solves ignore this field. Each entry whose
   * `cultivarId` matches a requested plant in `plants` is placed at its
   * original `(xIn, yIn)` first, claiming the corresponding spacing radius;
   * remaining requested plants then hex-pack into the unclaimed space.
   *
   * If two existing placements would overlap, first-wins (later overlapping
   * placements are dropped). Existing placements with cultivars not in the
   * current request are ignored. Counts in `plants` are upper bounds — if the
   * existing placements already cover the full requested count, no new
   * placements are added.
   */
  existingPlacements?: OptimizerPlacement[];
}

export interface OptimizerPlacement {
  cultivarId: string;
  /** Center position in inches relative to bed origin. */
  xIn: number;
  yIn: number;
}

export interface OptimizationCandidate {
  placements: OptimizerPlacement[];
  /** Total objective score (higher = better). */
  score: number;
  /** Human-readable reason summary, e.g., "8 plants placed". */
  reason: string;
  /** Solver gap actually achieved (e.g. 0.008 = 0.8%). */
  gap: number;
  /** Solve time, ms. */
  solveMs: number;
  /**
   * Diagnostic-only sum of pairwise objective contributions for plant pairs
   * that landed in DIFFERENT clusters. The clustered solver optimizes each
   * sub-bed independently, so cross-cluster pairs cannot influence the MIP
   * objective; this number reports what those contributions WOULD have been
   * at the chosen placements (using the same shading + same-species-buffer
   * formulas as in-cluster pairs). Useful for comparing candidates but does
   * not feed back into `score`. Undefined for unified (non-clustered)
   * solves. Typically ≤ 0 because the two terms are penalties.
   */
  crossClusterScore?: number;
  /**
   * Diagnostic-only: cluster sub-bed rectangles used by the clustered solver,
   * one per piece (post-split). Coordinates are in inches relative to the
   * parent bed origin. Undefined for unified (non-clustered) solves. Consumed
   * by debug overlays; does not affect placements or scoring.
   */
  clusterRegions?: Array<{
    key: string;
    offsetIn: { x: number; y: number };
    widthIn: number;
    lengthIn: number;
  }>;
}

export interface OptimizationResult {
  candidates: OptimizationCandidate[];
  /** Total wall-clock time across all candidate solves, ms. */
  totalMs: number;
}

export interface Cluster {
  /** Plants assigned to this cluster. */
  plants: OptimizerPlant[];
  /** Stable identifier for the cluster, used for diagnostic logging and per-cluster no-good cuts. */
  key: string;
}

export interface SubBed {
  cluster: Cluster;
  /** Sub-rectangle as a self-contained OptimizerBed. */
  bed: OptimizerBed;
  /** Offset of this sub-bed's origin within the parent bed, inches. */
  offsetIn: { x: number; y: number };
}

export const DEFAULT_WEIGHTS: OptimizerWeights = {
  shading: 1,
  sameSpeciesBuffer: 1,
};
