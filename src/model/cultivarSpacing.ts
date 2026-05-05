import type { Cultivar, CultivarCategory } from './cultivars';
import { getRelation, type CompanionRelation } from '../data/companions';

const CATEGORY_FALLBACK_PITCH_FT: Record<CultivarCategory, number> = {
  herbs: 0.75,
  vegetables: 1.0,
  greens: 0.5,
  fruits: 1.5,
  squash: 3.0,
  flowers: 0.75,
  'root-vegetables': 0.33,
  legumes: 0.5,
};

export function defaultPitchFor(cultivar: Cultivar): number {
  if (cultivar.footprintFt > 0) return cultivar.footprintFt * 2;
  return CATEGORY_FALLBACK_PITCH_FT[cultivar.category];
}

export function squareFootCountFor(cultivar: Cultivar): 1 | 4 | 9 | 16 {
  const fp = cultivar.footprintFt;
  if (fp >= 1.0) return 1;
  if (fp >= 0.5) return 4;
  if (fp >= 0.33) return 9;
  return 16;
}

export function defaultClearanceFor(_cultivar: Cultivar): number {
  return 0;
}

export function companions(a: Cultivar, b: Cultivar): CompanionRelation | null {
  return getRelation(a.speciesId, b.speciesId);
}
