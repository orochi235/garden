import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDuplicateAction } from './duplicate';
import type { DuplicateAdapter } from './duplicate';
import type { Op } from '@/canvas-kit';

interface Pose { x: number; y: number }

function makeAdapter(initial: string[] = []) {
  let selection = [...initial];
  const poses: Record<string, Pose> = { a: { x: 0, y: 0 }, b: { x: 10, y: 20 }, c: { x: 5, y: 5 } };
  const batches: { ops: Op[]; label: string }[] = [];
  let counter = 0;
  const adapter: DuplicateAdapter<Pose> = {
    getSelection: () => selection,
    getPose: (id) => poses[id] ?? { x: 0, y: 0 },
    cloneObject: (id, offset) => {
      counter += 1;
      const newId = `${id}-clone-${counter}`;
      const p = poses[id] ?? { x: 0, y: 0 };
      const newObj = { id: newId, x: p.x + offset.dx, y: p.y + offset.dy };
      poses[newId] = { x: newObj.x, y: newObj.y };
      return newObj;
    },
    applyBatch: (ops, label) => { batches.push({ ops, label: label ?? '' }); },
  };
  return {
    adapter, batches,
    setSel: (ids: string[]) => { selection = [...ids]; },
    poses,
  };
}

describe('useDuplicateAction', () => {
  it('empty selection: no applyBatch', () => {
    const helpers = makeAdapter([]);
    const { result } = renderHook(() => useDuplicateAction(helpers.adapter));
    act(() => { result.current.duplicate(); });
    expect(helpers.batches).toEqual([]);
  });

  it('non-empty selection: emits insert ops + setSelection with default label "Duplicate"', () => {
    const helpers = makeAdapter(['a', 'b']);
    const { result } = renderHook(() => useDuplicateAction(helpers.adapter));
    act(() => { result.current.duplicate(); });
    expect(helpers.batches).toHaveLength(1);
    expect(helpers.batches[0].label).toBe('Duplicate');
    // 2 inserts + 1 setSelection
    expect(helpers.batches[0].ops).toHaveLength(3);
  });

  it('default offset is { dx: 8, dy: 8 }', () => {
    const helpers = makeAdapter(['a']);
    const { result } = renderHook(() => useDuplicateAction(helpers.adapter));
    act(() => { result.current.duplicate(); });
    // cloneObject was invoked with the default offset; verify via the cloned pose
    const clone = Object.entries(helpers.poses).find(([k]) => k.startsWith('a-clone'));
    expect(clone).toBeDefined();
    expect(clone![1]).toEqual({ x: 8, y: 8 });
  });

  it('custom offset flows through', () => {
    const helpers = makeAdapter(['b']);
    const { result } = renderHook(() => useDuplicateAction(helpers.adapter, { offset: { dx: 100, dy: -50 } }));
    act(() => { result.current.duplicate(); });
    const clone = Object.entries(helpers.poses).find(([k]) => k.startsWith('b-clone'));
    expect(clone![1]).toEqual({ x: 110, y: -30 });
  });

  it('selection is set to the new clone ids', () => {
    const helpers = makeAdapter(['a', 'b']);
    const { result } = renderHook(() => useDuplicateAction(helpers.adapter));
    act(() => { result.current.duplicate(); });
    const lastOp = helpers.batches[0].ops[helpers.batches[0].ops.length - 1];
    // Apply against a tiny adapter to capture what setSelection got called with
    let captured: string[] = [];
    lastOp.apply({ setSelection: (ids: string[]) => { captured = ids; } });
    expect(captured).toHaveLength(2);
    expect(captured[0]).toMatch(/^a-clone/);
    expect(captured[1]).toMatch(/^b-clone/);
  });

  it('duplicate identity stable across renders', () => {
    const helpers = makeAdapter(['a']);
    const { result, rerender } = renderHook(() => useDuplicateAction(helpers.adapter));
    const first = result.current.duplicate;
    rerender();
    expect(result.current.duplicate).toBe(first);
  });

  describe('keyboard', () => {
    it('Cmd+D fires by default', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useDuplicateAction(helpers.adapter));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toHaveLength(1);
    });

    it('Ctrl+D fires by default', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useDuplicateAction(helpers.adapter));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toHaveLength(1);
    });

    it('preventDefault is called (avoid bookmark dialog)', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useDuplicateAction(helpers.adapter));
      const ev = new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true, cancelable: true });
      act(() => { document.dispatchEvent(ev); });
      expect(ev.defaultPrevented).toBe(true);
    });

    it('plain "d" does NOT fire', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useDuplicateAction(helpers.adapter));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toEqual([]);
    });

    it('enableKeyboard: false disables binding', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useDuplicateAction(helpers.adapter, { enableKeyboard: false }));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toEqual([]);
    });

    it('Cmd+D on input target does NOT fire', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useDuplicateAction(helpers.adapter));
      const input = document.createElement('input');
      document.body.appendChild(input);
      try {
        const ev = new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true, cancelable: true });
        act(() => { input.dispatchEvent(ev); });
        expect(helpers.batches).toEqual([]);
      } finally {
        document.body.removeChild(input);
      }
    });

    it('listener removed on unmount', () => {
      const helpers = makeAdapter(['a']);
      const { unmount } = renderHook(() => useDuplicateAction(helpers.adapter));
      unmount();
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toEqual([]);
    });
  });
});
