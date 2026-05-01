import { beforeEach, describe, expect, it } from 'vitest';
import { createGarden } from '../model/types';
import { canRedo, canUndo, clearHistory, pushHistory, redo, undo } from './history';

function makeGarden(name: string) {
  const g = createGarden({ name, widthFt: 10, heightFt: 10 });
  return g;
}

describe('history', () => {
  beforeEach(() => {
    clearHistory();
  });

  it('starts with nothing to undo or redo', () => {
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });

  it('can undo after pushing', () => {
    const g1 = makeGarden('v1');
    pushHistory(g1);
    expect(canUndo()).toBe(true);

    const current = makeGarden('v2');
    const result = undo(current);
    expect(result).not.toBeNull();
    expect(result!.garden.name).toBe('v1');
  });

  it('can redo after undo', () => {
    const g1 = makeGarden('v1');
    pushHistory(g1);

    const g2 = makeGarden('v2');
    undo(g2);

    expect(canRedo()).toBe(true);
    const result = redo(g1);
    expect(result).not.toBeNull();
    expect(result!.garden.name).toBe('v2');
  });

  it('clears future on new push', () => {
    const g1 = makeGarden('v1');
    pushHistory(g1);

    const g2 = makeGarden('v2');
    undo(g2);
    expect(canRedo()).toBe(true);

    pushHistory(makeGarden('v3'));
    expect(canRedo()).toBe(false);
  });

  it('returns null when nothing to undo', () => {
    const result = undo(makeGarden('current'));
    expect(result).toBeNull();
  });

  it('returns null when nothing to redo', () => {
    const result = redo(makeGarden('current'));
    expect(result).toBeNull();
  });

  it('handles multiple undo steps', () => {
    pushHistory(makeGarden('v1'));
    pushHistory(makeGarden('v2'));
    pushHistory(makeGarden('v3'));

    const current = makeGarden('v4');
    const r1 = undo(current);
    expect(r1!.garden.name).toBe('v3');
    const r2 = undo(r1!.garden);
    expect(r2!.garden.name).toBe('v2');
    const r3 = undo(r2!.garden);
    expect(r3!.garden.name).toBe('v1');
    const r4 = undo(r3!.garden);
    expect(r4).toBeNull();
  });

  it('captures selectedIds at push time and restores them on undo', () => {
    pushHistory(makeGarden('v1'), ['a', 'b']);
    const result = undo(makeGarden('v2'), ['c']);
    expect(result!.selectedIds).toEqual(['a', 'b']);
  });

  it('redo restores the selection that was current at undo time', () => {
    pushHistory(makeGarden('v1'), ['a']);
    undo(makeGarden('v2'), ['c', 'd']);
    const result = redo(makeGarden('v1'), ['a']);
    expect(result!.garden.name).toBe('v2');
    expect(result!.selectedIds).toEqual(['c', 'd']);
  });

  it('defaults selectedIds to [] when omitted (back-compat)', () => {
    pushHistory(makeGarden('v1'));
    const result = undo(makeGarden('v2'));
    expect(result!.selectedIds).toEqual([]);
  });
});
