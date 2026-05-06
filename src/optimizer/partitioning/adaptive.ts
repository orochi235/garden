import { familyCompanionPartitioner } from './familyCompanion';
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
 * Current heuristics:
 * - **Homogeneous bypass**: if `familyCompanionPartitioner` would produce
 *   exactly one cluster (all plants share a category, or all are
 *   uncategorized), return `null` so the caller skips clustering overhead
 *   and solves the input as-is via `solveUnified`. Splitting it into a
 *   single sub-bed equal to the parent and re-running the per-cluster
 *   pipeline buys nothing.
 * - **Otherwise**: fall back to `familyCompanionPartitioner`.
 *
 * Deferred dispatches (still TODO):
 * - **Paired-mirror**: pairs of complementary plants (e.g. 2 cultivars × 4
 *   each) might benefit from a partitioner that puts the pair in the same
 *   cluster.
 * - **Diversity-spread**: many small clusters that all individually fit
 *   should be batched into a single "diversity" cluster so the
 *   same-species spreading penalty can act across them.
 */
export const adaptivePartitioner: Partitioner = (input) => {
  const baseClusters = familyCompanionPartitioner(input);
  if (baseClusters.length <= 1) return null;
  return baseClusters;
};
