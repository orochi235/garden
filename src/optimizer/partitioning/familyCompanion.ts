import type { Cluster, OptimizationInput, OptimizerPlant } from '../types';

/**
 * Partition plants into clusters by category. Plants with no category go into
 * a single "other" bucket. Output is sorted by total footprint area descending
 * (largest cluster first) for deterministic ordering.
 */
export function familyCompanionPartitioner(input: OptimizationInput): Cluster[] {
  const buckets = new Map<string, OptimizerPlant[]>();
  for (const plant of input.plants) {
    const key = plant.category ?? 'other';
    const arr = buckets.get(key) ?? [];
    arr.push(plant);
    buckets.set(key, arr);
  }

  const clusters: Cluster[] = [];
  for (const [key, plants] of buckets) clusters.push({ key, plants });
  clusters.sort((a, b) => totalFootprintArea(b) - totalFootprintArea(a));
  return clusters;
}

function totalFootprintArea(c: { plants: OptimizerPlant[] }): number {
  let total = 0;
  for (const p of c.plants) {
    const r = p.footprintIn / 2;
    total += p.count * Math.PI * r * r;
  }
  return total;
}
