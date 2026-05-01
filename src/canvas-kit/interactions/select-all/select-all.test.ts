import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelectAllAction } from './select-all';
import type { SelectAllAdapter } from './select-all';
import type { Op } from '@/canvas-kit';

function makeAdapter(all: string[] = [], selection: string[] = []) {
  let sel = [...selection];
  const batches: { ops: Op[]; label: string }[] = [];
  const adapter: SelectAllAdapter = {
    getSelection: () => sel,
    listAll: () => all,
    applyBatch: (ops, label) => { batches.push({ ops, label: label ?? '' }); },
  };
  return { adapter, batches };
}

describe('useSelectAllAction', () => {
  it('emits one setSelection op containing all ids with default label', () => {
    const helpers = makeAdapter(['a', 'b', 'c']);
    const { result } = renderHook(() => useSelectAllAction(helpers.adapter));
    act(() => { result.current.selectAll(); });
    expect(helpers.batches).toHaveLength(1);
    expect(helpers.batches[0].label).toBe('Select all');
    expect(helpers.batches[0].ops).toHaveLength(1);
  });

  it('empty universe: no applyBatch', () => {
    const helpers = makeAdapter([]);
    const { result } = renderHook(() => useSelectAllAction(helpers.adapter));
    act(() => { result.current.selectAll(); });
    expect(helpers.batches).toEqual([]);
  });

  it('selectAll identity stable across renders', () => {
    const helpers = makeAdapter(['a']);
    const { result, rerender } = renderHook(() => useSelectAllAction(helpers.adapter));
    const first = result.current.selectAll;
    rerender();
    expect(result.current.selectAll).toBe(first);
  });

  describe('keyboard', () => {
    it('Cmd+A fires by default', () => {
      const helpers = makeAdapter(['a', 'b']);
      renderHook(() => useSelectAllAction(helpers.adapter));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toHaveLength(1);
    });

    it('Ctrl+A fires by default', () => {
      const helpers = makeAdapter(['a', 'b']);
      renderHook(() => useSelectAllAction(helpers.adapter));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toHaveLength(1);
    });

    it('Plain "a" without modifier does NOT fire', () => {
      const helpers = makeAdapter(['a', 'b']);
      renderHook(() => useSelectAllAction(helpers.adapter));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toEqual([]);
    });

    it('preventDefault is called', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useSelectAllAction(helpers.adapter));
      const ev = new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true });
      act(() => { document.dispatchEvent(ev); });
      expect(ev.defaultPrevented).toBe(true);
    });

    it('enableKeyboard: false disables binding', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useSelectAllAction(helpers.adapter, { enableKeyboard: false }));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toEqual([]);
    });

    it('Cmd+A on input target does NOT fire', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useSelectAllAction(helpers.adapter));
      const input = document.createElement('input');
      document.body.appendChild(input);
      try {
        const ev = new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true });
        act(() => { input.dispatchEvent(ev); });
        expect(helpers.batches).toEqual([]);
      } finally {
        document.body.removeChild(input);
      }
    });

    it('listener removed on unmount', () => {
      const helpers = makeAdapter(['a']);
      const { unmount } = renderHook(() => useSelectAllAction(helpers.adapter));
      unmount();
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toEqual([]);
    });
  });
});
