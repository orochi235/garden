/**
 * Public API for the bed-layout optimizer.
 *
 * This module is designed for extraction to a standalone npm package. It MUST NOT
 * import any project types — only plain numbers, strings, and arrays.
 */

export type Edge = 'N' | 'E' | 'S' | 'W';

export interface OptimizerBed {
  /** Bed width along the X axis, in inches. */
  widthIn: number;
  /** Bed depth along the Y axis, in inches. */
  heightIn: number;
  /** Trellis edge if any, used to attract climber-flagged plants. */
  trellisEdge: Edge | null;
  /** Per-edge clearance, inches. Default 0. */
  edgeClearanceIn: number;
}

export interface OptimizerPlant {
  /** Stable id; the optimizer treats each `count` copy as interchangeable. */
  cultivarId: string;
  /** How many of this plant the user wants to fit. */
  count: number;
  /** Footprint diameter in inches. */
  footprintIn: number;
  /** Mature height in inches. Used by the sun-shading term. */
  heightIn: number | null;
  /** True if the plant prefers a trellis edge. */
  climber: boolean;
}

export interface UserRegion {
  /** Bed-local rect in inches. */
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
  /** Cultivar ids that should prefer this region. */
  preferredCultivarIds: string[];
}

export interface OptimizerWeights {
  /** All weights are unitless multipliers, default 1.0. Set to 0 to disable a term. */
  shading: number;
  companion: number;
  antagonist: number;
  sameSpeciesBuffer: number;
  trellisAttraction: number;
  regionPreference: number;
}

/** Companion / antagonist relationships keyed by canonical "a|b" pair (a,b sorted). */
export interface CompanionTable {
  pairs: Record<string, 'companion' | 'antagonist'>;
}

export interface OptimizationInput {
  bed: OptimizerBed;
  plants: OptimizerPlant[];
  weights: OptimizerWeights;
  /** Cell size for discretization, inches. Default 4. */
  gridResolutionIn: number;
  /** Optional: relationship lookup. Missing pairs are treated as neutral. */
  companions: CompanionTable;
  /** Optional: user-painted preference regions. */
  userRegions: UserRegion[];
  /** Maximum solve time per candidate, seconds. */
  timeLimitSec: number;
  /** MIP optimality gap tolerance (0.01 = 1%). */
  mipGap: number;
  /** Number of candidates to return (1–3). */
  candidateCount: number;
  /** Minimum-difference threshold between candidates (cells, default 3). */
  diversityThreshold: number;
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
  /** Human-readable reason summary, e.g., "max sun, companions paired". */
  reason: string;
  /** Solver gap actually achieved (e.g. 0.008 = 0.8%). */
  gap: number;
  /** Solve time, ms. */
  solveMs: number;
}

export interface OptimizationResult {
  candidates: OptimizationCandidate[];
  /** Total wall-clock time across all candidate solves, ms. */
  totalMs: number;
}

export const DEFAULT_WEIGHTS: OptimizerWeights = {
  shading: 1,
  companion: 1,
  antagonist: 1,
  sameSpeciesBuffer: 1,
  trellisAttraction: 1,
  regionPreference: 1,
};
