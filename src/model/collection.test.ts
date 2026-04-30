import { describe, expect, it } from 'vitest';
import { snapshotCultivar, type Collection } from './collection';
import { getAllCultivars } from './cultivars';

describe('snapshotCultivar', () => {
  it('produces a deep copy that equals the source', () => {
    const source = getAllCultivars()[0];
    const snap = snapshotCultivar(source);
    expect(snap).toEqual(source);
  });

  it('does not share references with the source', () => {
    const source = getAllCultivars()[0];
    const snap = snapshotCultivar(source);
    expect(snap).not.toBe(source);
    // Mutating the snapshot must not affect the source.
    (snap as { name: string }).name = 'mutated';
    expect(source.name).not.toBe('mutated');
  });

  it('Collection type is Cultivar[]', () => {
    const empty: Collection = [];
    expect(empty).toEqual([]);
  });
});
