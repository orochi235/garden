import type { Cluster, OptimizerBed, SubBed, TrellisLocation } from '../types';

/**
 * Slice the bed into parallel strips, one per cluster, with strip widths
 * proportional to each cluster's total footprint area.
 *
 * Strip orientation: parallel to the trellis line (so the trellis runs *along*
 * the strip), or parallel to the bed's long axis when no trellis. Climber-
 * containing clusters get the strip(s) adjacent to the trellis line.
 *
 * V1 supports only edge trellises. Interior trellises (kind: 'line') are
 * deferred — they require the bed to be split *across* the trellis first,
 * which the area-allocation interface doesn't yet support.
 */
export function proportionalStripAllocator(bed: OptimizerBed, clusters: Cluster[]): SubBed[] {
  if (bed.trellis && bed.trellis.kind === 'line') {
    throw new Error('interior trellis (kind: "line") not supported in v1; deferred to TODO');
  }
  if (clusters.length === 0) return [];

  const orientation = stripOrientation(bed);
  const longAxisLen = orientation === 'horizontal' ? bed.lengthIn : bed.widthIn;

  const orderedClusters = orderClustersForTrellis(clusters, bed.trellis);

  const totalArea = clusters.reduce((sum, c) => sum + clusterArea(c), 0);
  if (totalArea <= 0) {
    return equalShareSubBeds(bed, orderedClusters, orientation);
  }

  const extents: { cluster: Cluster; start: number; end: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < orderedClusters.length; i++) {
    const c = orderedClusters[i];
    const share = clusterArea(c) / totalArea;
    const len = i === orderedClusters.length - 1 ? longAxisLen - cursor : longAxisLen * share;
    extents.push({ cluster: c, start: cursor, end: cursor + len });
    cursor += len;
  }

  const subBeds: SubBed[] = [];
  for (let i = 0; i < extents.length; i++) {
    const { cluster, start, end } = extents[i];
    const stripLen = end - start;
    const adjacentToTrellis = i === 0 && bed.trellis && bed.trellis.kind === 'edge';
    const subTrellis: TrellisLocation | null = adjacentToTrellis ? bed.trellis : null;
    if (orientation === 'horizontal') {
      subBeds.push({
        cluster,
        bed: {
          widthIn: bed.widthIn,
          lengthIn: stripLen,
          trellis: subTrellis,
          edgeClearanceIn: bed.edgeClearanceIn,
        },
        offsetIn: { x: 0, y: start },
      });
    } else {
      subBeds.push({
        cluster,
        bed: {
          widthIn: stripLen,
          lengthIn: bed.lengthIn,
          trellis: subTrellis,
          edgeClearanceIn: bed.edgeClearanceIn,
        },
        offsetIn: { x: start, y: 0 },
      });
    }
  }
  return subBeds;
}

function stripOrientation(bed: OptimizerBed): 'horizontal' | 'vertical' {
  if (bed.trellis && bed.trellis.kind === 'edge') {
    return bed.trellis.edge === 'N' || bed.trellis.edge === 'S' ? 'horizontal' : 'vertical';
  }
  return bed.lengthIn >= bed.widthIn ? 'horizontal' : 'vertical';
}

function orderClustersForTrellis(clusters: Cluster[], trellis: OptimizerBed['trellis']): Cluster[] {
  const isEdge = trellis && trellis.kind === 'edge';
  const sorted = [...clusters].sort((a, b) => clusterArea(b) - clusterArea(a));
  if (!isEdge) return sorted;
  const withClimbers = sorted.filter((c) => c.climberCount > 0);
  const without = sorted.filter((c) => c.climberCount === 0);
  withClimbers.sort((a, b) => b.climberCount - a.climberCount);
  if (trellis.edge === 'S' || trellis.edge === 'E') {
    return [...without, ...withClimbers];
  }
  return [...withClimbers, ...without];
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
        bed: { widthIn: bed.widthIn, lengthIn: stripLen, trellis: null, edgeClearanceIn: bed.edgeClearanceIn },
        offsetIn: { x: 0, y: start },
      };
    }
    return {
      cluster,
      bed: { widthIn: stripLen, lengthIn: bed.lengthIn, trellis: null, edgeClearanceIn: bed.edgeClearanceIn },
      offsetIn: { x: start, y: 0 },
    };
  });
}

function clusterArea(cluster: Cluster): number {
  let total = 0;
  for (const p of cluster.plants) {
    const r = p.footprintIn / 2;
    total += p.count * Math.PI * r * r;
  }
  return total;
}
