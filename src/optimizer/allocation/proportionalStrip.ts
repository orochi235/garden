import type { Cluster, OptimizerBed, SubBed } from '../types';

/**
 * Slice the bed into parallel strips, one per cluster, with strip widths
 * proportional to each cluster's total footprint area. Strips run along the
 * bed's long axis.
 */
export function proportionalStripAllocator(bed: OptimizerBed, clusters: Cluster[]): SubBed[] {
  if (clusters.length === 0) return [];

  const orientation: 'horizontal' | 'vertical' =
    bed.lengthIn >= bed.widthIn ? 'horizontal' : 'vertical';
  const longAxisLen = orientation === 'horizontal' ? bed.lengthIn : bed.widthIn;

  // Enforce a minimum strip width per cluster: the largest plant footprint in
  // the cluster (so at least one plant fits along the short dimension of the
  // strip) plus the bed's edge clearance on both sides. If the proportional
  // split would give any cluster a strip narrower than its minimum, drop the
  // smallest cluster (by area) and re-allocate among the rest. Dropped
  // clusters' plants are simply unallocated; the worker handles that path.
  let working = [...clusters].sort((a, b) => clusterArea(b) - clusterArea(a));
  while (working.length > 0) {
    const extents = computeExtents(working, longAxisLen);
    const violator = extents.find(
      (e) => e.end - e.start < minStripLen(e.cluster, bed.edgeClearanceIn),
    );
    if (!violator) break;
    // Drop the smallest cluster (last in the area-desc ordering).
    working = working.slice(0, -1);
  }
  if (working.length === 0) return [];

  const ordered = working;

  const totalArea = ordered.reduce((sum, c) => sum + clusterArea(c), 0);
  if (totalArea <= 0) {
    return equalShareSubBeds(bed, ordered, orientation);
  }

  const extents: { cluster: Cluster; start: number; end: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i];
    const share = clusterArea(c) / totalArea;
    const len = i === ordered.length - 1 ? longAxisLen - cursor : longAxisLen * share;
    extents.push({ cluster: c, start: cursor, end: cursor + len });
    cursor += len;
  }

  const subBeds: SubBed[] = [];
  for (const { cluster, start, end } of extents) {
    const stripLen = end - start;
    if (orientation === 'horizontal') {
      subBeds.push({
        cluster,
        bed: { widthIn: bed.widthIn, lengthIn: stripLen, edgeClearanceIn: bed.edgeClearanceIn },
        offsetIn: { x: 0, y: start },
      });
    } else {
      subBeds.push({
        cluster,
        bed: { widthIn: stripLen, lengthIn: bed.lengthIn, edgeClearanceIn: bed.edgeClearanceIn },
        offsetIn: { x: start, y: 0 },
      });
    }
  }
  return subBeds;
}

function equalShareSubBeds(
  bed: OptimizerBed,
  clusters: Cluster[],
  orientation: 'horizontal' | 'vertical',
): SubBed[] {
  const longAxisLen = orientation === 'horizontal' ? bed.lengthIn : bed.widthIn;
  const stripLen = longAxisLen / clusters.length;
  return clusters.map((cluster, i) => {
    const start = i * stripLen;
    if (orientation === 'horizontal') {
      return {
        cluster,
        bed: { widthIn: bed.widthIn, lengthIn: stripLen, edgeClearanceIn: bed.edgeClearanceIn },
        offsetIn: { x: 0, y: start },
      };
    }
    return {
      cluster,
      bed: { widthIn: stripLen, lengthIn: bed.lengthIn, edgeClearanceIn: bed.edgeClearanceIn },
      offsetIn: { x: start, y: 0 },
    };
  });
}

function computeExtents(
  ordered: Cluster[],
  longAxisLen: number,
): { cluster: Cluster; start: number; end: number }[] {
  const totalArea = ordered.reduce((sum, c) => sum + clusterArea(c), 0);
  const extents: { cluster: Cluster; start: number; end: number }[] = [];
  if (totalArea <= 0) {
    const stripLen = longAxisLen / ordered.length;
    for (let i = 0; i < ordered.length; i++) {
      extents.push({ cluster: ordered[i], start: i * stripLen, end: (i + 1) * stripLen });
    }
    return extents;
  }
  let cursor = 0;
  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i];
    const share = clusterArea(c) / totalArea;
    const len = i === ordered.length - 1 ? longAxisLen - cursor : longAxisLen * share;
    extents.push({ cluster: c, start: cursor, end: cursor + len });
    cursor += len;
  }
  return extents;
}

function minStripLen(cluster: Cluster, edgeClearanceIn: number): number {
  let maxFootprint = 0;
  for (const p of cluster.plants) {
    if (p.footprintIn > maxFootprint) maxFootprint = p.footprintIn;
  }
  return maxFootprint + edgeClearanceIn * 2;
}

function clusterArea(cluster: Cluster): number {
  let total = 0;
  for (const p of cluster.plants) {
    const r = p.footprintIn / 2;
    total += p.count * Math.PI * r * r;
  }
  return total;
}
