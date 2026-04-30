import { describe, expect, it } from 'vitest';
import { addToCollection, getCollectionCultivar, hasCultivar, removeFromCollection, snapshotCultivar, type Collection } from './collection';
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

describe('addToCollection', () => {
  it('adds new cultivars', () => {
    const [a, b] = getAllCultivars();
    const next = addToCollection([], [snapshotCultivar(a), snapshotCultivar(b)]);
    expect(next.map((c) => c.id)).toEqual([a.id, b.id]);
  });

  it('is idempotent on duplicate ids (keeps existing entry)', () => {
    const [a] = getAllCultivars();
    const original = snapshotCultivar(a);
    const duplicate = { ...snapshotCultivar(a), name: 'changed' };
    const next = addToCollection([original], [duplicate]);
    expect(next).toHaveLength(1);
    expect(next[0]).toBe(original);
  });

  it('preserves existing entries unrelated to the additions', () => {
    const [a, b] = getAllCultivars();
    const before = [snapshotCultivar(a)];
    const next = addToCollection(before, [snapshotCultivar(b)]);
    expect(next.map((c) => c.id)).toEqual([a.id, b.id]);
  });
});

describe('removeFromCollection', () => {
  it('removes the named ids', () => {
    const [a, b] = getAllCultivars();
    const next = removeFromCollection([snapshotCultivar(a), snapshotCultivar(b)], [a.id]);
    expect(next.map((c) => c.id)).toEqual([b.id]);
  });

  it('is idempotent on missing ids', () => {
    const [a] = getAllCultivars();
    const collection = [snapshotCultivar(a)];
    const next = removeFromCollection(collection, ['no-such-id']);
    expect(next).toEqual(collection);
  });

  it('returns empty when removing every id', () => {
    const [a] = getAllCultivars();
    const next = removeFromCollection([snapshotCultivar(a)], [a.id]);
    expect(next).toEqual([]);
  });
});

describe('hasCultivar / getCollectionCultivar', () => {
  it('finds present cultivars and reports absent ones', () => {
    const [a, b] = getAllCultivars();
    const collection = [snapshotCultivar(a)];
    expect(hasCultivar(collection, a.id)).toBe(true);
    expect(hasCultivar(collection, b.id)).toBe(false);
    expect(getCollectionCultivar(collection, a.id)?.id).toBe(a.id);
    expect(getCollectionCultivar(collection, b.id)).toBeUndefined();
  });
});
