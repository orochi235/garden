import type { Cluster, OptimizationInput } from '../types';

/**
 * Paired-mirror partitioner.
 *
 * **Match condition:** input has 2 or 3 distinct plant entries (cultivars) AND
 * every entry's `count` is within 50% of the mean count.
 *
 * **Rationale:** when a small number of cultivars are requested in roughly
 * equal counts (the canonical case: "2 cultivars × 4 each"), category-based
 * bucketing splits them into separate sub-beds even though the MILP, given
 * them all together, can naturally arrange them mirrored or interleaved and
 * usually produces a better layout than two skinny strips. Returning a single
 * cluster lets the unified solve handle it.
 *
 * **Safety net — bias toward fall-through when uncertain:**
 *   - Caps at 3 cultivars; 4+ is "many small things," not a pair → defer.
 *   - The 50%-of-mean band rejects lopsided inputs (e.g. 8 + 1) where
 *     "mirroring" is meaningless.
 *   - A single cultivar is the homogeneous-bypass case and is handled before
 *     this partitioner runs (returns null here too, just to be safe).
 *
 * Pure / project-decoupled: no imports outside `src/optimizer/`.
 */
export function pairedMirrorPartitioner(input: OptimizationInput): Cluster[] | null {
  const plants = input.plants;
  if (plants.length < 2 || plants.length > 3) return null;

  let total = 0;
  for (const p of plants) total += p.count;
  const mean = total / plants.length;
  if (mean <= 0) return null;

  // Each cultivar's count must be within ±50% of the mean. Tighter than
  // necessary on purpose — this is a speculative heuristic and we'd rather
  // miss a match than over-cluster antagonistic inputs.
  for (const p of plants) {
    const ratio = p.count / mean;
    if (ratio < 0.5 || ratio > 1.5) return null;
  }

  return [{ key: 'paired-mirror', plants: [...plants] }];
}
