import { describe, expect, it } from 'vitest';
import {
  bringForward,
  sendBackward,
  bringToFront,
  sendToBack,
  moveToIndex,
} from './reorderAlgorithms';

describe('bringForward', () => {
  it('moves a single id up one slot', () => {
    expect(bringForward(['a', 'b', 'c', 'd'], ['b'])).toEqual(['a', 'c', 'b', 'd']);
  });

  it('no-op when id is already top', () => {
    expect(bringForward(['a', 'b', 'c'], ['c'])).toEqual(['a', 'b', 'c']);
  });

  it('multi-id preserves relative order, bubbles each up one', () => {
    expect(bringForward(['a', 'b', 'c', 'd', 'e'], ['b', 'd'])).toEqual(['a', 'c', 'b', 'e', 'd']);
  });

  it('multi-id at top: top id stays, lower ones still bubble', () => {
    expect(bringForward(['a', 'b', 'c'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(bringForward(['a', 'b', 'c', 'd'], ['c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
    expect(bringForward(['a', 'b', 'c', 'd'], ['b', 'd'])).toEqual(['a', 'c', 'b', 'd']);
  });

  it('skips ids that are not in the list', () => {
    expect(bringForward(['a', 'b', 'c'], ['x', 'b'])).toEqual(['a', 'c', 'b']);
  });
});

describe('sendBackward', () => {
  it('moves a single id down one slot', () => {
    expect(sendBackward(['a', 'b', 'c', 'd'], ['c'])).toEqual(['a', 'c', 'b', 'd']);
  });

  it('no-op when id is already bottom', () => {
    expect(sendBackward(['a', 'b', 'c'], ['a'])).toEqual(['a', 'b', 'c']);
  });

  it('multi-id preserves relative order, drops each down one', () => {
    expect(sendBackward(['a', 'b', 'c', 'd', 'e'], ['b', 'd'])).toEqual(['b', 'a', 'd', 'c', 'e']);
  });
});

describe('bringToFront', () => {
  it('moves a single id to the end (top)', () => {
    expect(bringToFront(['a', 'b', 'c', 'd'], ['b'])).toEqual(['a', 'c', 'd', 'b']);
  });

  it('multi-id lands contiguously at the end, preserves relative order', () => {
    expect(bringToFront(['a', 'b', 'c', 'd', 'e'], ['b', 'd'])).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('skips ids not in the list', () => {
    expect(bringToFront(['a', 'b'], ['x'])).toEqual(['a', 'b']);
  });
});

describe('sendToBack', () => {
  it('moves a single id to the start (bottom)', () => {
    expect(sendToBack(['a', 'b', 'c', 'd'], ['c'])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('multi-id lands contiguously at the start, preserves relative order', () => {
    expect(sendToBack(['a', 'b', 'c', 'd', 'e'], ['b', 'd'])).toEqual(['b', 'd', 'a', 'c', 'e']);
  });
});

describe('moveToIndex', () => {
  it('places ids contiguously starting at index, preserves relative order', () => {
    expect(moveToIndex(['a', 'b', 'c', 'd', 'e'], ['a', 'd'], 2)).toEqual(['b', 'c', 'a', 'd', 'e']);
  });

  it('clamps index to valid range', () => {
    expect(moveToIndex(['a', 'b', 'c'], ['a'], 99)).toEqual(['b', 'c', 'a']);
    expect(moveToIndex(['a', 'b', 'c'], ['c'], -5)).toEqual(['c', 'a', 'b']);
  });

  it('skips ids not in the list', () => {
    expect(moveToIndex(['a', 'b', 'c'], ['x', 'a'], 1)).toEqual(['b', 'a', 'c']);
  });
});
