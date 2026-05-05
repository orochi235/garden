import type { Cluster, OptimizationInput, OptimizerPlant } from '../types';

const MERGE_THRESHOLD = 1; // one companion pair (count product 1, weight 1) suffices

/**
 * Partition plants into clusters by category, then iteratively merge clusters
 * whose strongest companion bridge meets `MERGE_THRESHOLD`. Plants with no
 * category go into a single "other" bucket. Antagonist relations contribute
 * negative weight to bridge strength but do not on their own block a merge —
 * they only counter companion ties within the same pair of categories.
 *
 * Output is sorted by total footprint area descending (largest cluster first)
 * for deterministic ordering across identical inputs.
 */
export function familyCompanionPartitioner(input: OptimizationInput): Cluster[] {
  const buckets = new Map<string, OptimizerPlant[]>();
  for (const plant of input.plants) {
    const key = plant.category ?? 'other';
    const arr = buckets.get(key) ?? [];
    arr.push(plant);
    buckets.set(key, arr);
  }

  let groups: { key: string; plants: OptimizerPlant[] }[] = [];
  for (const [key, plants] of buckets) groups.push({ key, plants });

  const maxIterations = Math.max(0, groups.length - 1);
  for (let iter = 0; iter < maxIterations; iter++) {
    let bestI = -1;
    let bestJ = -1;
    let bestStrength = MERGE_THRESHOLD;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const s = bridgeStrength(groups[i], groups[j], input);
        if (s > bestStrength) {
          bestStrength = s;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0) break;
    const merged = {
      key: `${groups[bestI].key}+${groups[bestJ].key}`,
      plants: [...groups[bestI].plants, ...groups[bestJ].plants],
    };
    groups = groups.filter((_, idx) => idx !== bestI && idx !== bestJ);
    groups.push(merged);
  }

  const clusters: Cluster[] = groups.map((g) => ({
    key: g.key,
    plants: g.plants,
    climberCount: g.plants.reduce((sum, p) => sum + (p.climber ? p.count : 0), 0),
  }));

  clusters.sort((a, b) => totalFootprintArea(b) - totalFootprintArea(a));
  return clusters;
}

function bridgeStrength(
  a: { plants: OptimizerPlant[] },
  b: { plants: OptimizerPlant[] },
  input: OptimizationInput,
): number {
  const wCompanion = input.weights.companion;
  const wAntagonist = input.weights.antagonist;
  let total = 0;
  for (const pa of a.plants) {
    for (const pb of b.plants) {
      const key = [pa.cultivarId, pb.cultivarId].sort().join('|');
      const rel = input.companions.pairs[key];
      const weight = rel === 'companion' ? wCompanion : rel === 'antagonist' ? -wAntagonist : 0;
      total += pa.count * pb.count * weight;
    }
  }
  return total;
}

function totalFootprintArea(c: { plants: OptimizerPlant[] }): number {
  let total = 0;
  for (const p of c.plants) {
    const r = p.footprintIn / 2;
    total += p.count * Math.PI * r * r;
  }
  return total;
}
