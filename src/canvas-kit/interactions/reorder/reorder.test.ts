import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReorderAction } from './reorder';
import type { Op } from '../../ops/types';

interface FakeAdapter {
  selection: string[];
  parents: Record<string, string | null>;
  children: Record<string, string[]>;
  applied: Array<{ ops: Op[]; label: string }>;
  getSelection(): string[];
  getParent(id: string): string | null;
  getChildren(parentId: string | null): string[];
  setChildOrder(parentId: string | null, ids: string[]): void;
  applyBatch(ops: Op[], label: string): void;
}

function makeAdapter(opts: { selection?: string[]; parents?: Record<string, string | null>; children?: Record<string, string[]> } = {}): FakeAdapter {
  const a: FakeAdapter = {
    selection: opts.selection ?? [],
    parents: opts.parents ?? {},
    children: Object.fromEntries(Object.entries(opts.children ?? {}).map(([k, v]) => [k, v.slice()])),
    applied: [],
    getSelection() { return this.selection.slice(); },
    getParent(id) { return this.parents[id] ?? null; },
    getChildren(parentId) { return (this.children[parentId ?? 'ROOT'] ?? []).slice(); },
    setChildOrder(parentId, ids) { this.children[parentId ?? 'ROOT'] = ids.slice(); },
    applyBatch(ops, label) {
      // In tests, apply each op so ordering is observable.
      this.applied.push({ ops, label });
      for (const op of ops) op.apply(this);
    },
  };
  return a;
}

describe('useReorderAction', () => {
  it('bringForward applies a single batch with createBringForwardOp', () => {
    const a = makeAdapter({
      selection: ['x'],
      parents: { x: null, y: null },
      children: { ROOT: ['x', 'y'] },
    });
    const { result } = renderHook(() => useReorderAction(a, { enableKeyboard: false }));
    act(() => { result.current.bringForward(); });
    expect(a.applied).toHaveLength(1);
    expect(a.applied[0].label).toBe('Bring forward');
    expect(a.children.ROOT).toEqual(['y', 'x']);
  });

  it('sendBackward / bringToFront / sendToBack each fire one batch with the right label', () => {
    const make = () => makeAdapter({
      selection: ['b'],
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });

    const a1 = make();
    const { result: r1 } = renderHook(() => useReorderAction(a1, { enableKeyboard: false }));
    act(() => { r1.current.sendBackward(); });
    expect(a1.applied[0].label).toBe('Send backward');

    const a2 = make();
    const { result: r2 } = renderHook(() => useReorderAction(a2, { enableKeyboard: false }));
    act(() => { r2.current.bringToFront(); });
    expect(a2.applied[0].label).toBe('Bring to front');
    expect(a2.children.ROOT).toEqual(['a', 'c', 'b']);

    const a3 = make();
    const { result: r3 } = renderHook(() => useReorderAction(a3, { enableKeyboard: false }));
    act(() => { r3.current.sendToBack(); });
    expect(a3.applied[0].label).toBe('Send to back');
    expect(a3.children.ROOT).toEqual(['b', 'a', 'c']);
  });

  it('multi-id selection across parents reorders each parent independently', () => {
    const a = makeAdapter({
      selection: ['a', 'x'],
      parents: { a: null, b: null, x: 'g1', y: 'g1' },
      children: { ROOT: ['a', 'b'], g1: ['x', 'y'] },
    });
    const { result } = renderHook(() => useReorderAction(a, { enableKeyboard: false }));
    act(() => { result.current.bringForward(); });
    expect(a.children.ROOT).toEqual(['b', 'a']);
    expect(a.children.g1).toEqual(['y', 'x']);
  });

  it('empty selection is a no-op', () => {
    const a = makeAdapter({ selection: [], parents: {}, children: { ROOT: [] } });
    const { result } = renderHook(() => useReorderAction(a, { enableKeyboard: false }));
    act(() => { result.current.bringForward(); });
    expect(a.applied).toHaveLength(0);
  });

  it('keyboard: "]" → bringForward, "[" → sendBackward, Shift+"]" → bringToFront, Shift+"[" → sendToBack', () => {
    const a = makeAdapter({
      selection: ['b'],
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    renderHook(() => useReorderAction(a, { enableKeyboard: true }));

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ']' })); });
    expect(a.applied.at(-1)?.label).toBe('Bring forward');

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: '[' })); });
    expect(a.applied.at(-1)?.label).toBe('Send backward');

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ']', shiftKey: true })); });
    expect(a.applied.at(-1)?.label).toBe('Bring to front');

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: '[', shiftKey: true })); });
    expect(a.applied.at(-1)?.label).toBe('Send to back');
  });

  it('keyboard guard: ignores key in input/textarea/contenteditable', () => {
    const a = makeAdapter({
      selection: ['b'],
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    renderHook(() => useReorderAction(a, { enableKeyboard: true }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })); });
    expect(a.applied).toHaveLength(0);
    document.body.removeChild(input);
  });

  it('keyboard guard: ignores when Cmd/Ctrl/Alt held', () => {
    const a = makeAdapter({
      selection: ['b'],
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    renderHook(() => useReorderAction(a, { enableKeyboard: true }));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ']', metaKey: true })); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ']', ctrlKey: true })); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ']', altKey: true })); });
    expect(a.applied).toHaveLength(0);
  });

  it('filter option restricts which selected ids are reordered', () => {
    const a = makeAdapter({
      selection: ['a', 'b'],
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    const { result } = renderHook(() =>
      useReorderAction(a, { enableKeyboard: false, filter: (ids) => ids.filter((i) => i !== 'a') }),
    );
    act(() => { result.current.bringForward(); });
    expect(a.children.ROOT).toEqual(['a', 'c', 'b']);
  });

  it('no-ops silently when getChildren/setChildOrder are absent', () => {
    const stub = {
      selection: ['a'],
      getSelection() { return this.selection; },
      getParent: () => null,
      applyBatch: (_ops: Op[]) => {},
      // no getChildren / setChildOrder
    };
    const { result } = renderHook(() => useReorderAction(stub as never, { enableKeyboard: false }));
    expect(() => act(() => { result.current.bringForward(); })).not.toThrow();
  });
});
