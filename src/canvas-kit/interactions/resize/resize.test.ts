import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizeInteraction } from './resize';
import { clampMinSize } from './behaviors/clampMinSize';
import { snapToGrid } from './behaviors/snapToGrid';
import type { ResizeBehavior, ResizePose } from '../types';
import type { Op } from '../../ops/types';
import type { ResizeAdapter } from '../../adapters/types';

interface P extends ResizePose {}

function makeAdapter(initial?: Array<[string, P]>) {
  const state = new Map<string, P>(
    initial ?? [['a', { x: 0, y: 0, width: 10, height: 10 }]],
  );
  const batches: { ops: Op[]; label: string }[] = [];
  const adapter: ResizeAdapter<{ id: string }, P> = {
    getObject: (id) => (state.has(id) ? { id } : undefined),
    getPose: (id) => ({ ...(state.get(id)!) }),
    setPose: (id, pose) => state.set(id, { ...pose }),
    applyBatch: (ops, label) => {
      batches.push({ ops, label });
      for (const op of ops) op.apply(adapter);
    },
  };
  return { adapter, batches, state };
}

describe('useResizeInteraction — start / cancel', () => {
  it('start sets isResizing and overlay; cancel clears them with no batch', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() => useResizeInteraction<{ id: string }, P>(adapter, {}));
    expect(result.current.isResizing).toBe(false);

    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 0, 0);
    });
    expect(result.current.isResizing).toBe(true);
    expect(result.current.overlay).not.toBeNull();
    expect(result.current.overlay!.id).toBe('a');
    expect(result.current.overlay!.currentPose).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(result.current.overlay!.targetPose).toEqual({ x: 0, y: 0, width: 10, height: 10 });

    act(() => {
      result.current.cancel();
    });
    expect(result.current.isResizing).toBe(false);
    expect(result.current.overlay).toBeNull();
    expect(batches).toEqual([]);
  });
});

describe('useResizeInteraction — move', () => {
  it('east anchor=min: width grows toward target; currentPose lerps 35%', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() => useResizeInteraction<{ id: string }, P>(adapter, {}));
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    act(() => {
      result.current.move(14, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    const ov = result.current.overlay!;
    expect(ov.targetPose).toEqual({ x: 0, y: 0, width: 14, height: 10 });
    expect(ov.currentPose.width).toBeCloseTo(11.4, 5);
  });

  it('behaviors compose in order; clampMinSize integrates', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, {
        behaviors: [clampMinSize<P>({ minWidth: 1, minHeight: 1 })],
      }),
    );
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    act(() => {
      result.current.move(-2, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    expect(result.current.overlay!.targetPose.width).toBe(1);
  });

  it('snapToGrid integrates: targetPose snaps; sub-grid origin suspends snap', () => {
    const { adapter, state } = makeAdapter();
    state.set('a', { x: 0, y: 0, width: 0.5, height: 10 });
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, {
        behaviors: [snapToGrid<P>({ cell: 1 })],
      }),
    );
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 0.5, 0);
    });
    act(() => {
      result.current.move(0.7, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    expect(result.current.overlay!.targetPose.width).toBeCloseTo(0.7, 5);
  });
});

describe('useResizeInteraction — end', () => {
  it('emits one TransformOp using targetPose (not lerped currentPose)', () => {
    const { adapter, batches, state } = makeAdapter();
    const { result } = renderHook(() => useResizeInteraction<{ id: string }, P>(adapter, {}));
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    act(() => {
      result.current.move(14, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].label).toBe('Resize');
    expect(batches[0].ops).toHaveLength(1);
    expect(state.get('a')).toEqual({ x: 0, y: 0, width: 14, height: 10 });
  });

  it('end with no move emits no batch', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() => useResizeInteraction<{ id: string }, P>(adapter, {}));
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toEqual([]);
  });

  it('behavior onEnd returning Op[] overrides default', () => {
    const { adapter, batches } = makeAdapter();
    const customOp: Op = {
      apply() {},
      invert() { return customOp; },
      label: 'Custom',
    };
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, {
        behaviors: [{ onEnd: () => [customOp] }],
      }),
    );
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    act(() => {
      result.current.move(14, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].ops[0]).toBe(customOp);
  });

  it('behavior onEnd returning null aborts (no batch)', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, {
        behaviors: [{ onEnd: () => null }],
      }),
    );
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    act(() => {
      result.current.move(14, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toEqual([]);
  });
});

describe('useResizeInteraction — group (expandIds)', () => {
  const NO_MOD = { alt: false, shift: false, meta: false, ctrl: false };

  it('expandIds returning the same single id leaves single-leaf behavior unchanged', () => {
    const { adapter, batches, state } = makeAdapter();
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, {
        expandIds: (ids) => ids,
      }),
    );
    act(() => {
      result.current.start('a', { x: 'min', y: 'free' }, 10, 0);
    });
    act(() => {
      result.current.move(14, 0, NO_MOD);
    });
    expect(result.current.overlay!.id).toBe('a');
    expect(result.current.overlay!.targetPose).toEqual({ x: 0, y: 0, width: 14, height: 10 });
    act(() => {
      result.current.end();
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].ops).toHaveLength(1);
    expect(state.get('a')).toEqual({ x: 0, y: 0, width: 14, height: 10 });
  });

  it('SE-corner drag: both group leaves scale proportionally in width and height', () => {
    const { adapter, batches, state } = makeAdapter([
      ['a', { x: 0, y: 0, width: 10, height: 10 }],
      ['b', { x: 20, y: 20, width: 10, height: 10 }],
    ]);
    const expandIds = (ids: string[]) => (ids[0] === 'G' ? ['a', 'b'] : ids);
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, { expandIds }),
    );
    act(() => {
      result.current.start('G', { x: 'min', y: 'min' }, 30, 30);
    });
    expect(result.current.overlay!.id).toBe('G');
    expect(result.current.overlay!.targetPose).toEqual({ x: 0, y: 0, width: 30, height: 30 });

    act(() => {
      result.current.move(60, 60, NO_MOD);
    });
    const ov = result.current.overlay!;
    expect(ov.targetPose).toEqual({ x: 0, y: 0, width: 60, height: 60 });
    expect(ov.leafPoses).toBeDefined();
    expect(ov.leafPoses!.get('a')).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    expect(ov.leafPoses!.get('b')).toEqual({ x: 40, y: 40, width: 20, height: 20 });

    act(() => {
      result.current.end();
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].label).toBe('Resize');
    expect(batches[0].ops).toHaveLength(2);
    expect(state.get('a')).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    expect(state.get('b')).toEqual({ x: 40, y: 40, width: 20, height: 20 });
  });

  it('NW-corner drag: rect closer to NW moves more in absolute terms', () => {
    const { adapter, batches, state } = makeAdapter([
      ['a', { x: 0, y: 0, width: 10, height: 10 }],
      ['b', { x: 20, y: 20, width: 10, height: 10 }],
    ]);
    const expandIds = (ids: string[]) => (ids[0] === 'G' ? ['a', 'b'] : ids);
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, { expandIds }),
    );
    act(() => {
      result.current.start('G', { x: 'max', y: 'max' }, 0, 0);
    });
    act(() => {
      result.current.move(-30, -30, NO_MOD);
    });
    const ov = result.current.overlay!;
    expect(ov.targetPose).toEqual({ x: -30, y: -30, width: 60, height: 60 });
    expect(ov.leafPoses!.get('a')).toEqual({ x: -30, y: -30, width: 20, height: 20 });
    expect(ov.leafPoses!.get('b')).toEqual({ x: 10, y: 10, width: 20, height: 20 });

    act(() => {
      result.current.end();
    });
    expect(state.get('a')).toEqual({ x: -30, y: -30, width: 20, height: 20 });
    expect(state.get('b')).toEqual({ x: 10, y: 10, width: 20, height: 20 });
    expect(batches[0].ops).toHaveLength(2);
  });

  it('asymmetric group bounds preserve relative positions/sizes after scaling', () => {
    const { adapter, state } = makeAdapter([
      ['tall', { x: 0, y: 0, width: 5, height: 30 }],
      ['wide', { x: 10, y: 0, width: 30, height: 5 }],
    ]);
    const expandIds = (ids: string[]) => (ids[0] === 'G' ? ['tall', 'wide'] : ids);
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, { expandIds }),
    );
    act(() => {
      result.current.start('G', { x: 'min', y: 'min' }, 40, 30);
    });
    act(() => {
      result.current.move(80, 60, NO_MOD);
    });
    const ov = result.current.overlay!;
    expect(ov.leafPoses!.get('tall')).toEqual({ x: 0, y: 0, width: 10, height: 60 });
    expect(ov.leafPoses!.get('wide')).toEqual({ x: 20, y: 0, width: 60, height: 10 });
    act(() => {
      result.current.end();
    });
    expect(state.get('tall')).toEqual({ x: 0, y: 0, width: 10, height: 60 });
    expect(state.get('wide')).toEqual({ x: 20, y: 0, width: 60, height: 10 });
  });

  it('behavior runs on group bounds — snap width to 100 snaps GROUP, not each child', () => {
    const { adapter, state } = makeAdapter([
      ['a', { x: 0, y: 0, width: 40, height: 40 }],
      ['b', { x: 50, y: 0, width: 40, height: 40 }],
    ]);
    const expandIds = (ids: string[]) => (ids[0] === 'G' ? ['a', 'b'] : ids);
    const snapBehavior: ResizeBehavior<P> = {
      onMove: (_ctx, { pose }) => ({ pose: { ...pose, width: 100 } }),
    };
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, {
        expandIds,
        behaviors: [snapBehavior],
      }),
    );
    act(() => {
      result.current.start('G', { x: 'min', y: 'free' }, 90, 0);
    });
    act(() => {
      result.current.move(95, 0, NO_MOD);
    });
    const ov = result.current.overlay!;
    expect(ov.targetPose.width).toBe(100);
    const a = ov.leafPoses!.get('a')!;
    const b = ov.leafPoses!.get('b')!;
    expect(a.width).toBeCloseTo(40 * (100 / 90), 5);
    expect(b.width).toBeCloseTo(40 * (100 / 90), 5);
    expect(a.width).not.toBe(100);
    act(() => {
      result.current.end();
    });
    expect(state.get('a')!.width).toBeCloseTo(40 * (100 / 90), 5);
    expect(state.get('b')!.width).toBeCloseTo(40 * (100 / 90), 5);
  });

  it('zero-area group axis (colinear leaves): zero axis scale is no-op (no NaN)', () => {
    const { adapter, state } = makeAdapter([
      ['a', { x: 0, y: 5, width: 10, height: 0 }],
      ['b', { x: 20, y: 5, width: 10, height: 0 }],
    ]);
    const expandIds = (ids: string[]) => (ids[0] === 'G' ? ['a', 'b'] : ids);
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, { expandIds }),
    );
    act(() => {
      result.current.start('G', { x: 'min', y: 'min' }, 30, 5);
    });
    act(() => {
      result.current.move(60, 10, NO_MOD);
    });
    const ov = result.current.overlay!;
    const a = ov.leafPoses!.get('a')!;
    const b = ov.leafPoses!.get('b')!;
    expect(Number.isFinite(a.x)).toBe(true);
    expect(Number.isFinite(a.y)).toBe(true);
    expect(Number.isFinite(a.width)).toBe(true);
    expect(Number.isFinite(a.height)).toBe(true);
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Number.isFinite(b.y)).toBe(true);
    expect(a.y).toBe(5);
    expect(a.height).toBe(0);
    expect(b.y).toBe(5);
    expect(b.height).toBe(0);
    expect(a.x).toBe(0);
    expect(a.width).toBe(20);
    expect(b.x).toBe(40);
    expect(b.width).toBe(20);
    act(() => {
      result.current.end();
    });
    expect(state.get('a')!.height).toBe(0);
  });

  it('end emits N transformOps in one batch with shared label', () => {
    const { adapter, batches } = makeAdapter([
      ['a', { x: 0, y: 0, width: 10, height: 10 }],
      ['b', { x: 20, y: 20, width: 10, height: 10 }],
      ['c', { x: 40, y: 40, width: 10, height: 10 }],
    ]);
    const expandIds = (ids: string[]) => (ids[0] === 'G' ? ['a', 'b', 'c'] : ids);
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, {
        expandIds,
        resizeLabel: 'Resize Group',
      }),
    );
    act(() => {
      result.current.start('G', { x: 'min', y: 'min' }, 50, 50);
    });
    act(() => {
      result.current.move(100, 100, NO_MOD);
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].label).toBe('Resize Group');
    expect(batches[0].ops).toHaveLength(3);
  });

  it('cancel emits no ops in group path', () => {
    const { adapter, batches } = makeAdapter([
      ['a', { x: 0, y: 0, width: 10, height: 10 }],
      ['b', { x: 20, y: 20, width: 10, height: 10 }],
    ]);
    const expandIds = (ids: string[]) => (ids[0] === 'G' ? ['a', 'b'] : ids);
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, { expandIds }),
    );
    act(() => {
      result.current.start('G', { x: 'min', y: 'min' }, 30, 30);
    });
    act(() => {
      result.current.move(60, 60, NO_MOD);
    });
    act(() => {
      result.current.cancel();
    });
    expect(batches).toEqual([]);
    expect(result.current.overlay).toBeNull();
  });

  it('group end with no move emits no batch', () => {
    const { adapter, batches } = makeAdapter([
      ['a', { x: 0, y: 0, width: 10, height: 10 }],
      ['b', { x: 20, y: 20, width: 10, height: 10 }],
    ]);
    const expandIds = (ids: string[]) => (ids[0] === 'G' ? ['a', 'b'] : ids);
    const { result } = renderHook(() =>
      useResizeInteraction<{ id: string }, P>(adapter, { expandIds }),
    );
    act(() => {
      result.current.start('G', { x: 'min', y: 'min' }, 30, 30);
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toEqual([]);
  });
});

