import { describe, expect, it } from 'vitest';
import {
  createBringForwardOp,
  createSendBackwardOp,
  createBringToFrontOp,
  createSendToBackOp,
  createMoveToIndexOp,
} from './reorder';

interface FakeAdapter {
  parents: Record<string, string | null>;
  children: Record<string, string[]>; // key 'ROOT' for null
  getParent(id: string): string | null;
  getChildren(parentId: string | null): string[];
  setChildOrder(parentId: string | null, ids: string[]): void;
}

function makeAdapter(init: { parents: Record<string, string | null>; children: Record<string, string[]> }): FakeAdapter {
  const a: FakeAdapter = {
    parents: { ...init.parents },
    children: Object.fromEntries(Object.entries(init.children).map(([k, v]) => [k, v.slice()])),
    getParent(id) { return this.parents[id] ?? null; },
    getChildren(parentId) { return (this.children[parentId ?? 'ROOT'] ?? []).slice(); },
    setChildOrder(parentId, ids) { this.children[parentId ?? 'ROOT'] = ids.slice(); },
  };
  return a;
}

describe('createBringForwardOp', () => {
  it('moves selected id up one slot among its siblings', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    createBringForwardOp({ ids: ['a'] }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'a', 'c']);
  });

  it('partitions multi-parent selection: each parent reorders independently', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, x: 'g1', y: 'g1' },
      children: { ROOT: ['a', 'b'], g1: ['x', 'y'] },
    });
    createBringForwardOp({ ids: ['a', 'x'] }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'a']);
    expect(a.children.g1).toEqual(['y', 'x']);
  });

  it('invert restores the previous order per parent', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    const op = createBringForwardOp({ ids: ['a'] });
    op.apply(a);
    op.invert().apply(a);
    expect(a.children.ROOT).toEqual(['a', 'b', 'c']);
  });

  it('no-ops when getChildren is missing on adapter', () => {
    const stub = {
      getParent: () => null,
      // no getChildren / setChildOrder
    };
    expect(() => createBringForwardOp({ ids: ['a'] }).apply(stub)).not.toThrow();
  });

  it('skips ids not present in their reported parent\'s children', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, ghost: null },
      children: { ROOT: ['a', 'b'] }, // ghost is not actually here
    });
    createBringForwardOp({ ids: ['ghost', 'a'] }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'a']);
  });
});

describe('createSendBackwardOp', () => {
  it('moves selected id down one slot', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    createSendBackwardOp({ ids: ['c'] }).apply(a);
    expect(a.children.ROOT).toEqual(['a', 'c', 'b']);
  });

  it('invert restores the previous order', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    const op = createSendBackwardOp({ ids: ['c'] });
    op.apply(a);
    op.invert().apply(a);
    expect(a.children.ROOT).toEqual(['a', 'b', 'c']);
  });
});

describe('createBringToFrontOp', () => {
  it('moves ids to the end preserving relative order', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null, d: null },
      children: { ROOT: ['a', 'b', 'c', 'd'] },
    });
    createBringToFrontOp({ ids: ['a', 'c'] }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'd', 'a', 'c']);
  });

  it('invert round-trips', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    const op = createBringToFrontOp({ ids: ['a'] });
    op.apply(a);
    op.invert().apply(a);
    expect(a.children.ROOT).toEqual(['a', 'b', 'c']);
  });
});

describe('createSendToBackOp', () => {
  it('moves ids to the start preserving relative order', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null, d: null },
      children: { ROOT: ['a', 'b', 'c', 'd'] },
    });
    createSendToBackOp({ ids: ['b', 'd'] }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('createMoveToIndexOp', () => {
  it('places ids at index, preserving relative order', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null, d: null, e: null },
      children: { ROOT: ['a', 'b', 'c', 'd', 'e'] },
    });
    createMoveToIndexOp({ ids: ['a', 'd'], parentId: null, index: 2 }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'c', 'a', 'd', 'e']);
  });

  it('skips ids whose current parent does not match the target parent', () => {
    const a = makeAdapter({
      parents: { a: null, x: 'g1' },
      children: { ROOT: ['a'], g1: ['x'] },
    });
    createMoveToIndexOp({ ids: ['a', 'x'], parentId: null, index: 0 }).apply(a);
    expect(a.children.ROOT).toEqual(['a']);
    expect(a.children.g1).toEqual(['x']);
  });

  it('invert restores the prior order', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    const op = createMoveToIndexOp({ ids: ['c'], parentId: null, index: 0 });
    op.apply(a);
    op.invert().apply(a);
    expect(a.children.ROOT).toEqual(['a', 'b', 'c']);
  });
});
