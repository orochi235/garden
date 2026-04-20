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
    expect(result!.name).toBe('v1');
  });

  it('can redo after undo', () => {
    const g1 = makeGarden('v1');
    pushHistory(g1);

    const g2 = makeGarden('v2');
    undo(g2);

    expect(canRedo()).toBe(true);
    const result = redo(g1);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('v2');
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
    expect(r1!.name).toBe('v3');
    const r2 = undo(r1!);
    expect(r2!.name).toBe('v2');
    const r3 = undo(r2!);
    expect(r3!.name).toBe('v1');
    const r4 = undo(r3!);
    expect(r4).toBeNull();
  });
});
