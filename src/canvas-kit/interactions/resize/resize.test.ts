import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizeInteraction } from './resize';
import { clampMinSize } from './behaviors/clampMinSize';
import { snapToGrid } from './behaviors/snapToGrid';
import type { ResizePose } from '../types';
import type { Op } from '../../ops/types';
import type { ResizeAdapter } from '../../adapters/types';

interface P extends ResizePose {}

function makeAdapter() {
  const state = new Map<string, P>([
    ['a', { x: 0, y: 0, width: 10, height: 10 }],
  ]);
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
