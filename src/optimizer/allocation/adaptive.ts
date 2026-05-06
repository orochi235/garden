import type { Cluster, OptimizerBed, SubBed } from '../types';
import { proportionalStripAllocator } from './proportionalStrip';
import { guillotineAllocator } from './guillotine';

/**
 * Threshold for picking guillotine over proportional strips.
 *
 * Rationale: when cluster areas are roughly equal, proportional strips give
 * each cluster a strip whose aspect ratio is close to (bed-short / (bed-long/N))
 * — fine. As the largest cluster's area grows relative to the smallest, the
 * proportional strip allocates the big cluster a long thin slice that wastes
 * space at strip ends. Guillotine recursive cuts produce sub-rectangles whose
 * aspect ratios stay closer to the square root of the area share, which
 * generally packs better when areas are highly skewed.
 *
 * 3.0 is a defensible middle ground: at max/min ratios up to ~3 the strip
 * allocator's aspect ratios are still reasonable; beyond that, the guillotine
 * starts paying off. Empirically this lines up with the homogeneous-cluster
 * cases we see today (max/min ~1, strips clearly correct) versus mixed beds
 * with one dominant family and several singletons (max/min often 5–20×).
 */
export const GUILLOTINE_THRESHOLD = 3.0;

/**
 * Choose between proportional-strip and guillotine allocators based on
 * cluster-area variance. See `GUILLOTINE_THRESHOLD` for the rationale.
 */
export function adaptiveAllocator(bed: OptimizerBed, clusters: Cluster[]): SubBed[] {
  if (clusters.length <= 1) {
    return proportionalStripAllocator(bed, clusters);
  }
  const areas = clusters.map(clusterArea).filter((a) => a > 0);
  if (areas.length === 0) {
    return proportionalStripAllocator(bed, clusters);
  }
  const maxA = Math.max(...areas);
  const minA = Math.min(...areas);
  const ratio = minA > 0 ? maxA / minA : Infinity;
  if (ratio > GUILLOTINE_THRESHOLD) {
    return guillotineAllocator(bed, clusters);
  }
  return proportionalStripAllocator(bed, clusters);
}

function clusterArea(cluster: Cluster): number {
  let total = 0;
  for (const p of cluster.plants) {
    const r = p.footprintIn / 2;
    total += p.count * Math.PI * r * r;
  }
  return total;
}
