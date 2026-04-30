import type { Cultivar } from './cultivars';

/** A garden's collection: an inline list of Cultivar snapshots. Type-identical to the flora database. */
export type Collection = Cultivar[];

/** Produce a self-contained deep copy of a database cultivar suitable for inclusion in a collection. */
export function snapshotCultivar(cultivar: Cultivar): Cultivar {
  return structuredClone(cultivar);
}
