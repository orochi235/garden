import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEscapeAction } from './escape';
import type { EscapeAdapter } from './escape';
import type { Op } from '@/canvas-kit';

function makeAdapter(initial: string[] = []) {
  let selection = [...initial];
  const batches: { ops: Op[]; label: string }[] = [];
  const adapter: EscapeAdapter = {
    getSelection: () => selection,
    applyBatch: (ops, label) => { batches.push({ ops, label: label ?? '' }); },
  };
  return { adapter, batches, setSel: (ids: string[]) => { selection = [...ids]; } };
}

describe('useEscapeAction', () => {
  it('emits one setSelection op with default label "Clear selection"', () => {
    const helpers = makeAdapter(['a', 'b']);
    const { result } = renderHook(() => useEscapeAction(helpers.adapter));
    act(() => { result.current.clearSelection(); });
    expect(helpers.batches).toHaveLength(1);
    expect(helpers.batches[0].label).toBe('Clear selection');
    expect(helpers.batches[0].ops).toHaveLength(1);
  });

  it('empty selection: no applyBatch', () => {
    const helpers = makeAdapter([]);
    const { result } = renderHook(() => useEscapeAction(helpers.adapter));
    act(() => { result.current.clearSelection(); });
    expect(helpers.batches).toEqual([]);
  });

  it('clearSelection identity is stable across renders', () => {
    const helpers = makeAdapter(['a']);
    const { result, rerender } = renderHook(() => useEscapeAction(helpers.adapter));
    const first = result.current.clearSelection;
    rerender();
    expect(result.current.clearSelection).toBe(first);
  });

  describe('keyboard', () => {
    it('Escape on document fires by default', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useEscapeAction(helpers.adapter));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toHaveLength(1);
    });

    it('enableKeyboard: false disables binding', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useEscapeAction(helpers.adapter, { enableKeyboard: false }));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toEqual([]);
    });

    it('Escape on input target does NOT fire', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useEscapeAction(helpers.adapter));
      const input = document.createElement('input');
      document.body.appendChild(input);
      try {
        const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        act(() => { input.dispatchEvent(ev); });
        expect(helpers.batches).toEqual([]);
      } finally {
        document.body.removeChild(input);
      }
    });

    it('Escape on contenteditable does NOT fire', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useEscapeAction(helpers.adapter));
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      document.body.appendChild(div);
      try {
        const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        act(() => { div.dispatchEvent(ev); });
        expect(helpers.batches).toEqual([]);
      } finally {
        document.body.removeChild(div);
      }
    });

    it('listener is removed on unmount', () => {
      const helpers = makeAdapter(['a']);
      const { unmount } = renderHook(() => useEscapeAction(helpers.adapter));
      unmount();
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toEqual([]);
    });
  });
});
