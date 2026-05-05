/**
 * Curated seed table of companion and antagonist relationships.
 * Lookup is symmetric — getRelation('a', 'b') === getRelation('b', 'a').
 *
 * This is intentionally small; missing pairs return null and the optimizer
 * treats them as neutral. Expand over time.
 */

export type CompanionRelation = 'companion' | 'antagonist';

interface PairRow {
  a: string;
  b: string;
  rel: CompanionRelation;
}

const PAIRS: PairRow[] = [
  { a: 'tomato', b: 'basil', rel: 'companion' },
  { a: 'tomato', b: 'carrot', rel: 'companion' },
  { a: 'tomato', b: 'brassica', rel: 'antagonist' },
  { a: 'carrot', b: 'onion', rel: 'companion' },
  { a: 'carrot', b: 'dill', rel: 'antagonist' },
  { a: 'lettuce', b: 'radish', rel: 'companion' },
  { a: 'cucumber', b: 'nasturtium', rel: 'companion' },
  { a: 'cucumber', b: 'sage', rel: 'antagonist' },
  { a: 'beans', b: 'corn', rel: 'companion' },
  { a: 'beans', b: 'onion', rel: 'antagonist' },
  { a: 'pepper', b: 'basil', rel: 'companion' },
  { a: 'squash', b: 'corn', rel: 'companion' },
  { a: 'squash', b: 'beans', rel: 'companion' },
  { a: 'brassica', b: 'dill', rel: 'companion' },
  { a: 'brassica', b: 'strawberry', rel: 'antagonist' },
  { a: 'spinach', b: 'strawberry', rel: 'companion' },
  { a: 'onion', b: 'pea', rel: 'antagonist' },
  { a: 'pea', b: 'carrot', rel: 'companion' },
  { a: 'pea', b: 'corn', rel: 'companion' },
  { a: 'beet', b: 'onion', rel: 'companion' },
  { a: 'beet', b: 'pole-bean', rel: 'antagonist' },
  { a: 'asparagus', b: 'tomato', rel: 'companion' },
  { a: 'celery', b: 'leek', rel: 'companion' },
  { a: 'leek', b: 'carrot', rel: 'companion' },
  { a: 'corn', b: 'tomato', rel: 'antagonist' },
  { a: 'fennel', b: 'tomato', rel: 'antagonist' },
  { a: 'fennel', b: 'beans', rel: 'antagonist' },
  { a: 'garlic', b: 'lettuce', rel: 'companion' },
  { a: 'garlic', b: 'pea', rel: 'antagonist' },
  { a: 'mint', b: 'cabbage', rel: 'companion' },
];

const map = new Map<string, CompanionRelation>();
for (const { a, b, rel } of PAIRS) {
  map.set(`${a}|${b}`, rel);
  map.set(`${b}|${a}`, rel);
}

/** Look up the relationship between two species or category keys. Returns null when no pair is defined. */
export function getRelation(a: string, b: string): CompanionRelation | null {
  return map.get(`${a}|${b}`) ?? null;
}
