import { describe, expect, it } from 'vitest';
import { createGarden } from '../model/types';
import { createHistoryStack } from './history';

function makeGarden(name: string) {
  return createGarden({ name, widthFt: 10, lengthFt: 10 });
}

describe('createHistoryStack', () => {
  it('starts with nothing to undo or redo', () => {
    const h = createHistoryStack<ReturnType<typeof makeGarden>>();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it('can undo after pushing', () => {
    const h = createHistoryStack<ReturnType<typeof makeGarden>>();
    const g1 = makeGarden('v1');
    h.push(g1);
    expect(h.canUndo()).toBe(true);

    const current = makeGarden('v2');
    const result = h.undo(current);
    expect(result).not.toBeNull();
    expect(result!.value.name).toBe('v1');
  });

  it('can redo after undo', () => {
    const h = createHistoryStack<ReturnType<typeof makeGarden>>();
    const g1 = makeGarden('v1');
    h.push(g1);

    const g2 = makeGarden('v2');
    h.undo(g2);

    expect(h.canRedo()).toBe(true);
    const result = h.redo(g1);
    expect(result).not.toBeNull();
    expect(result!.value.name).toBe('v2');
  });

  it('clears future on new push', () => {
    const h = createHistoryStack<ReturnType<typeof makeGarden>>();
    const g1 = makeGarden('v1');
    h.push(g1);

    const g2 = makeGarden('v2');
    h.undo(g2);
    expect(h.canRedo()).toBe(true);

    h.push(makeGarden('v3'));
    expect(h.canRedo()).toBe(false);
  });

  it('returns null when nothing to undo', () => {
    const h = createHistoryStack<ReturnType<typeof makeGarden>>();
    const result = h.undo(makeGarden('current'));
    expect(result).toBeNull();
  });

  it('returns null when nothing to redo', () => {
    const h = createHistoryStack<ReturnType<typeof makeGarden>>();
    const result = h.redo(makeGarden('current'));
    expect(result).toBeNull();
  });

  it('handles multiple undo steps', () => {
    const h = createHistoryStack<ReturnType<typeof makeGarden>>();
    h.push(makeGarden('v1'));
    h.push(makeGarden('v2'));
    h.push(makeGarden('v3'));

    const current = makeGarden('v4');
    const r1 = h.undo(current);
    expect(r1!.value.name).toBe('v3');
    const r2 = h.undo(r1!.value);
    expect(r2!.value.name).toBe('v2');
    const r3 = h.undo(r2!.value);
    expect(r3!.value.name).toBe('v1');
    const r4 = h.undo(r3!.value);
    expect(r4).toBeNull();
  });

  it('captures selectedIds at push time and restores them on undo', () => {
    const h = createHistoryStack<ReturnType<typeof makeGarden>>();
    h.push(makeGarden('v1'), ['a', 'b']);
    const result = h.undo(makeGarden('v2'), ['c']);
    expect(result!.selectedIds).toEqual(['a', 'b']);
  });

  it('redo restores the selection that was current at undo time', () => {
    const h = createHistoryStack<ReturnType<typeof makeGarden>>();
    h.push(makeGarden('v1'), ['a']);
    h.undo(makeGarden('v2'), ['c', 'd']);
    const result = h.redo(makeGarden('v1'), ['a']);
    expect(result!.value.name).toBe('v2');
    expect(result!.selectedIds).toEqual(['c', 'd']);
  });

  it('defaults selectedIds to [] when omitted', () => {
    const h = createHistoryStack<ReturnType<typeof makeGarden>>();
    h.push(makeGarden('v1'));
    const result = h.undo(makeGarden('v2'));
    expect(result!.selectedIds).toEqual([]);
  });

  it('caps at MAX_HISTORY (100) — oldest entry is dropped when 101 are pushed', () => {
    const h = createHistoryStack<{ n: number }>();
    for (let i = 0; i < 101; i++) h.push({ n: i });
    // 100 entries remain; undo 100 times should reach n=1, not n=0
    let last = h.undo({ n: 101 });
    for (let i = 0; i < 99; i++) last = h.undo(last!.value);
    expect(last!.value.n).toBe(1); // n=0 was dropped
    expect(h.undo(last!.value)).toBeNull();
  });

  it('clear empties both past and future', () => {
    const h = createHistoryStack<{ n: number }>();
    h.push({ n: 1 });
    h.push({ n: 2 });
    h.undo({ n: 3 });
    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });
});
