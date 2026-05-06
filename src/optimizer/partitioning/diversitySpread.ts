import { familyCompanionPartitioner } from './familyCompanion';
import type { Cluster, OptimizationInput, OptimizerPlant } from '../types';

const SMALL_CLUSTER_THRESHOLD = 5;
const MIN_SMALL_CLUSTERS = 4;

/**
 * Diversity-spread partitioner.
 *
 * **Match condition:** `familyCompanionPartitioner` produces ≥4 clusters AND
 * every cluster has fewer than 5 plants (counted as `sum(plant.count)`).
 *
 * **Rationale:** when category bucketing yields many tiny clusters, the
 * proportional-strip allocator over-fragments the bed into thin strips that
 * each waste edge area, AND the same-species-buffer penalty cannot fire
 * across clusters (it's a within-cluster MIP term). Merging small clusters
 * back together gives the spreading penalty something to act on.
 *
 * **What "merge" means here:** we group clusters by category prefix (the
 * existing cluster `key`, which is the plant `category` or `'other'`), then
 * concatenate ALL of them into a single 'diversity' cluster. This is
 * intentionally aggressive — small clusters by definition can't dominate
 * each other, so cross-category mixing inside one sub-bed is acceptable.
 *
 * **Safety net — bias toward fall-through when uncertain:**
 *   - Requires ≥4 small clusters; 2–3 small clusters stay separated (the
 *     allocator handles them fine).
 *   - Any single cluster ≥5 plants → defer. A medium-or-larger cluster
 *     deserves its own sub-bed; mixing it with stragglers would dilute the
 *     same-species packing it needs.
 *   - Returns `null` (not the original clusters) on miss so the caller
 *     re-derives them via the default partitioner — keeps this function's
 *     contract aligned with the others (null = "I don't apply").
 *
 * Pure / project-decoupled: no imports outside `src/optimizer/`.
 */
export function diversitySpreadPartitioner(input: OptimizationInput): Cluster[] | null {
  const base = familyCompanionPartitioner(input);
  if (base.length < MIN_SMALL_CLUSTERS) return null;

  for (const c of base) {
    if (plantCount(c.plants) >= SMALL_CLUSTER_THRESHOLD) return null;
  }

  const merged: OptimizerPlant[] = [];
  for (const c of base) merged.push(...c.plants);
  return [{ key: 'diversity', plants: merged }];
}

function plantCount(plants: OptimizerPlant[]): number {
  let n = 0;
  for (const p of plants) n += p.count;
  return n;
}
