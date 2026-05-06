import { diversitySpreadPartitioner } from './diversitySpread';
import { familyCompanionPartitioner } from './familyCompanion';
import { pairedMirrorPartitioner } from './pairedMirror';
import type { Cluster, OptimizationInput } from '../types';

/**
 * Strategy that decides how (or whether) to partition an `OptimizationInput`
 * into sub-bed clusters. Returning `null` signals "no clustering needed —
 * caller should solve this input directly via `solveUnified`."
 *
 * Pure function: given the same input it must return the same partitioning.
 * MUST NOT import outside `src/optimizer/`.
 */
export type Partitioner = (input: OptimizationInput) => Cluster[] | null;

/**
 * Dispatches to the appropriate partitioner based on a quick inspection of
 * the input.
 *
 * Dispatch order (first match wins; partitioners that don't apply return
 * null and we fall through):
 *   1. **Homogeneous bypass** — if `familyCompanionPartitioner` would
 *      produce exactly one cluster, return `null` so the caller skips the
 *      clustering pipeline entirely and runs `solveUnified`.
 *   2. **Paired-mirror** — 2–3 cultivars with roughly equal counts collapse
 *      into a single cluster so the MILP can mirror/interleave them.
 *   3. **Diversity-spread** — when category bucketing yields ≥4 tiny
 *      clusters (each <5 plants), merge them so the same-species spreading
 *      penalty acts across the whole sub-bed.
 *   4. **Default** — `familyCompanionPartitioner` (category buckets).
 *
 * Each speculative partitioner (2 and 3) is biased toward returning `null`
 * on uncertainty: they fall through to the default rather than risk
 * over-clustering. Antagonistic plants or clusters with genuinely different
 * shading needs should not be merged — both partitioners cap their match
 * conditions tightly to avoid that.
 */
export const adaptivePartitioner: Partitioner = (input) => {
  // 1. Homogeneous bypass (use base partitioner since paired-mirror would
  // also collapse a single cultivar to one cluster, but bypass means "skip
  // the whole pipeline" which is a different signal).
  const baseClusters = familyCompanionPartitioner(input);
  if (baseClusters.length <= 1) return null;

  // 2. Paired-mirror: small N, balanced counts.
  const paired = pairedMirrorPartitioner(input);
  if (paired) return paired;

  // 3. Diversity-spread: many tiny clusters.
  const diversity = diversitySpreadPartitioner(input);
  if (diversity) return diversity;

  // 4. Default: category buckets.
  return baseClusters;
};
