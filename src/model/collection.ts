import type { Cultivar } from './cultivars';

/** A garden's collection: an inline list of Cultivar snapshots. Type-identical to the flora database. */
export type Collection = Cultivar[];

/** Produce a self-contained deep copy of a database cultivar suitable for inclusion in a collection. */
export function snapshotCultivar(cultivar: Cultivar): Cultivar {
  return structuredClone(cultivar);
}

/** Append cultivars whose ids are not already present. Idempotent. Stable order: existing first, then new in insertion order. */
export function addToCollection(collection: Collection, additions: Cultivar[]): Collection {
  if (additions.length === 0) return collection;
  const existing = new Set(collection.map((c) => c.id));
  const fresh = additions.filter((c) => !existing.has(c.id));
  if (fresh.length === 0) return collection;
  return [...collection, ...fresh];
}

/** Remove cultivars by id. Idempotent on missing ids. */
export function removeFromCollection(collection: Collection, ids: string[]): Collection {
  if (ids.length === 0) return collection;
  const toRemove = new Set(ids);
  const next = collection.filter((c) => !toRemove.has(c.id));
  return next.length === collection.length ? collection : next;
}

export function hasCultivar(collection: Collection, id: string): boolean {
  return collection.some((c) => c.id === id);
}

export function getCollectionCultivar(collection: Collection, id: string): Cultivar | undefined {
  return collection.find((c) => c.id === id);
}

import type { Planting } from './types';
import type { Seedling } from './seedStarting';

/** Of the cultivar ids being removed, return those still referenced by any planting or seedling. */
export function findInUseRemovals(
  removedIds: string[],
  plantings: Planting[],
  seedlings: Seedling[],
): string[] {
  if (removedIds.length === 0) return [];
  const removed = new Set(removedIds);
  const found = new Set<string>();
  for (const p of plantings) {
    if (removed.has(p.cultivarId)) found.add(p.cultivarId);
  }
  for (const s of seedlings) {
    if (removed.has(s.cultivarId)) found.add(s.cultivarId);
  }
  return [...found];
}
