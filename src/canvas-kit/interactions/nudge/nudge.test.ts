import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNudgeAction } from './nudge';
import type { NudgeAdapter } from './nudge';
import type { Op } from '@/canvas-kit';

interface Pose { x: number; y: number }

const translatePose = (p: Pose, dx: number, dy: number): Pose => ({ x: p.x + dx, y: p.y + dy });

function makeAdapter(initial: string[] = []) {
  let selection = [...initial];
  const poses: Record<string, Pose> = { a: { x: 0, y: 0 }, b: { x: 10, y: 20 } };
  const batches: { ops: Op[]; label: string }[] = [];
  const adapter: NudgeAdapter<Pose> = {
    getSelection: () => selection,
    getPose: (id) => poses[id] ?? { x: 0, y: 0 },
    applyBatch: (ops, label) => { batches.push({ ops, label: label ?? '' }); },
  };
  return { adapter, batches, setSel: (ids: string[]) => { selection = [...ids]; }, poses };
}

// Capture what setPose was called with by applying an op against a stub adapter.
function applyOp(op: Op): { id: string; pose: Pose } {
  let captured: { id: string; pose: Pose } = { id: '', pose: { x: NaN, y: NaN } };
  op.apply({ setPose: (id: string, pose: Pose) => { captured = { id, pose }; } });
  return captured;
}

describe('useNudgeAction', () => {
  it('empty selection: no applyBatch', () => {
    const helpers = makeAdapter([]);
    const { result } = renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
    act(() => { result.current.nudge('right'); });
    expect(helpers.batches).toEqual([]);
  });

  it('emits one transform op per selected id with default label "Nudge"', () => {
    const helpers = makeAdapter(['a', 'b']);
    const { result } = renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
    act(() => { result.current.nudge('right'); });
    expect(helpers.batches).toHaveLength(1);
    expect(helpers.batches[0].label).toBe('Nudge');
    expect(helpers.batches[0].ops).toHaveLength(2);
  });

  it('right nudges +dx by default step (1)', () => {
    const helpers = makeAdapter(['a']);
    const { result } = renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
    act(() => { result.current.nudge('right'); });
    expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: 1, y: 0 } });
  });

  it('left nudges -dx', () => {
    const helpers = makeAdapter(['a']);
    const { result } = renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
    act(() => { result.current.nudge('left'); });
    expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: -1, y: 0 } });
  });

  it('up nudges -dy', () => {
    const helpers = makeAdapter(['a']);
    const { result } = renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
    act(() => { result.current.nudge('up'); });
    expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: 0, y: -1 } });
  });

  it('down nudges +dy', () => {
    const helpers = makeAdapter(['a']);
    const { result } = renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
    act(() => { result.current.nudge('down'); });
    expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: 0, y: 1 } });
  });

  it('large=true uses default shiftStep (10)', () => {
    const helpers = makeAdapter(['a']);
    const { result } = renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
    act(() => { result.current.nudge('right', true); });
    expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: 10, y: 0 } });
  });

  it('custom step + shiftStep flow through', () => {
    const helpers = makeAdapter(['a']);
    const { result } = renderHook(() => useNudgeAction(helpers.adapter, { translatePose, step: 4, shiftStep: 40 }));
    act(() => { result.current.nudge('right'); });
    expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: 4, y: 0 } });
    act(() => { result.current.nudge('down', true); });
    expect(applyOp(helpers.batches[1].ops[0])).toEqual({ id: 'a', pose: { x: 0, y: 40 } });
  });

  it('multi-select: each id gets its own transformOp from its own pose', () => {
    const helpers = makeAdapter(['a', 'b']);
    const { result } = renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
    act(() => { result.current.nudge('right'); });
    expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: 1, y: 0 } });
    expect(applyOp(helpers.batches[0].ops[1])).toEqual({ id: 'b', pose: { x: 11, y: 20 } });
  });

  it('nudge identity stable across renders', () => {
    const helpers = makeAdapter(['a']);
    const { result, rerender } = renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
    const first = result.current.nudge;
    rerender();
    expect(result.current.nudge).toBe(first);
  });

  describe('keyboard', () => {
    it('ArrowRight fires nudge right by default', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toHaveLength(1);
      expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: 1, y: 0 } });
    });

    it('ArrowLeft fires nudge left', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
      });
      expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: -1, y: 0 } });
    });

    it('ArrowUp fires nudge up', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      });
      expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: 0, y: -1 } });
    });

    it('ArrowDown fires nudge down', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      });
      expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: 0, y: 1 } });
    });

    it('Shift+ArrowRight uses shiftStep', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
      });
      expect(applyOp(helpers.batches[0].ops[0])).toEqual({ id: 'a', pose: { x: 10, y: 0 } });
    });

    it('preventDefault is called on a fire', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
      const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      act(() => { document.dispatchEvent(ev); });
      expect(ev.defaultPrevented).toBe(true);
    });

    it('Arrow with meta/ctrl/alt does NOT fire (avoid clashing with system shortcuts)', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', metaKey: true, bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toEqual([]);
    });

    it('enableKeyboard: false disables binding', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useNudgeAction(helpers.adapter, { translatePose, enableKeyboard: false }));
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toEqual([]);
    });

    it('Arrow on input target does NOT fire', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
      const input = document.createElement('input');
      document.body.appendChild(input);
      try {
        const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
        act(() => { input.dispatchEvent(ev); });
        expect(helpers.batches).toEqual([]);
      } finally {
        document.body.removeChild(input);
      }
    });

    it('Arrow on contenteditable does NOT fire', () => {
      const helpers = makeAdapter(['a']);
      renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      document.body.appendChild(div);
      try {
        const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
        act(() => { div.dispatchEvent(ev); });
        expect(helpers.batches).toEqual([]);
      } finally {
        document.body.removeChild(div);
      }
    });

    it('listener removed on unmount', () => {
      const helpers = makeAdapter(['a']);
      const { unmount } = renderHook(() => useNudgeAction(helpers.adapter, { translatePose }));
      unmount();
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      });
      expect(helpers.batches).toEqual([]);
    });
  });
});
