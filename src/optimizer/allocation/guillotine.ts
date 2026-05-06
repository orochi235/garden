import type { Cluster, OptimizerBed, SubBed } from '../types';

/**
 * Guillotine recursive-cut allocator.
 *
 * At each step, choose the cluster with the largest area as the "anchor",
 * cut the current rectangle along its longer axis at a position proportional
 * to the anchor's area share of the remaining clusters, and assign the anchor
 * to one side. Recurse on the other side with the remaining clusters.
 *
 * Compared to the proportional-strip allocator, guillotine cuts produce
 * sub-bed aspect ratios closer to square when cluster areas are skewed —
 * a strip allocator gives the largest cluster a disproportionately long,
 * thin strip, which tends to waste space at strip edges.
 *
 * Drops smallest-area clusters when an MIN_STRIP-style constraint can't be
 * satisfied (matching `proportionalStrip`'s policy).
 */
export function guillotineAllocator(bed: OptimizerBed, clusters: Cluster[]): SubBed[] {
  if (clusters.length === 0) return [];

  // Drop smallest clusters until every cluster's worst-case dimension fits.
  // Worst case here: assume a cluster might end up in a sub-rectangle whose
  // shorter side equals its proportional share of either bed dimension. We
  // approximate the same policy as proportionalStrip: any cluster whose
  // square-root-of-area is smaller than its min strip would not fit.
  let working = [...clusters].sort((a, b) => clusterArea(b) - clusterArea(a));
  while (working.length > 0) {
    const totalArea = working.reduce((s, c) => s + clusterArea(c), 0);
    if (totalArea <= 0) break;
    const bedArea = bed.widthIn * bed.lengthIn;
    const violator = working.find((c) => {
      const share = clusterArea(c) / totalArea;
      const subArea = bedArea * share;
      // A roughly square sub-rect would have sides ~sqrt(subArea); require
      // the shorter side to clear the cluster's min strip.
      const approxSide = Math.sqrt(subArea);
      return approxSide < minStripLen(c, bed.edgeClearanceIn);
    });
    if (!violator) break;
    working = working.slice(0, -1);
  }
  if (working.length === 0) return [];

  return cut(bed, { x: 0, y: 0 }, working);
}

function cut(
  bed: OptimizerBed,
  offset: { x: number; y: number },
  clusters: Cluster[],
): SubBed[] {
  if (clusters.length === 0) return [];
  if (clusters.length === 1) {
    return [{ cluster: clusters[0], bed, offsetIn: { ...offset } }];
  }

  // Sort by area desc; pick the largest as the "anchor" to cut off.
  const sorted = [...clusters].sort((a, b) => clusterArea(b) - clusterArea(a));
  const anchor = sorted[0];
  const rest = sorted.slice(1);
  const totalArea = sorted.reduce((s, c) => s + clusterArea(c), 0);
  const anchorShare = totalArea > 0 ? clusterArea(anchor) / totalArea : 1 / sorted.length;

  // Pick the cut axis that gives the anchor the most square-shaped piece.
  // For each candidate axis, compute the anchor sub-rect's aspect ratio
  // (≥ 1) and choose the axis that minimizes it. This keeps a dominant
  // cluster from getting a long thin strip when its area share is near 1.
  const anchorLenIfHorizontal = bed.lengthIn * anchorShare;
  const anchorLenIfVertical = bed.widthIn * anchorShare;
  const aspectHorizontal = aspect(bed.widthIn, anchorLenIfHorizontal);
  const aspectVertical = aspect(anchorLenIfVertical, bed.lengthIn);
  const cutHorizontal = aspectHorizontal <= aspectVertical;
  const longLen = cutHorizontal ? bed.lengthIn : bed.widthIn;
  let anchorLen = longLen * anchorShare;
  // Clamp so the anchor's piece can host the cluster (min strip), and the
  // remaining piece can host at least one of the other clusters.
  const anchorMin = minStripLen(anchor, bed.edgeClearanceIn);
  const restMin = Math.max(...rest.map((c) => minStripLen(c, bed.edgeClearanceIn)));
  anchorLen = Math.max(anchorMin, Math.min(longLen - restMin, anchorLen));
  if (!Number.isFinite(anchorLen) || anchorLen <= 0) anchorLen = longLen * anchorShare;

  const anchorBed: OptimizerBed = cutHorizontal
    ? { widthIn: bed.widthIn, lengthIn: anchorLen, edgeClearanceIn: bed.edgeClearanceIn }
    : { widthIn: anchorLen, lengthIn: bed.lengthIn, edgeClearanceIn: bed.edgeClearanceIn };
  const restBed: OptimizerBed = cutHorizontal
    ? { widthIn: bed.widthIn, lengthIn: longLen - anchorLen, edgeClearanceIn: bed.edgeClearanceIn }
    : { widthIn: longLen - anchorLen, lengthIn: bed.lengthIn, edgeClearanceIn: bed.edgeClearanceIn };
  const restOffset = cutHorizontal
    ? { x: offset.x, y: offset.y + anchorLen }
    : { x: offset.x + anchorLen, y: offset.y };

  const anchorSub: SubBed = { cluster: anchor, bed: anchorBed, offsetIn: { ...offset } };
  return [anchorSub, ...cut(restBed, restOffset, rest)];
}

function aspect(w: number, h: number): number {
  if (w <= 0 || h <= 0) return Infinity;
  return Math.max(w, h) / Math.min(w, h);
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
