import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapToContainer } from './snapToContainer';
import type { GestureContext } from '../types';
import type { SnapTarget } from '../../adapters/types';

interface Pose { x: number; y: number }

function makeCtx(): GestureContext<Pose> {
  return {
    draggedIds: ['p1'],
    origin: new Map([['p1', { x: 0, y: 0 }]]),
    current: new Map([['p1', { x: 1, y: 1 }]]),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false },
    pointer: { worldX: 5, worldY: 5, clientX: 100, clientY: 100 },
    adapter: { getParent: () => 'oldParent' } as any,
    scratch: {},
  };
}

describe('snapToContainer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sets snap state immediately when findTarget returns instant=true', () => {
    const target: SnapTarget<Pose> = { parentId: 'box', slotPose: { x: 2, y: 3 }, metadata: { instant: true } };
    const findTarget = vi.fn().mockReturnValue(target);
    const b = snapToContainer<Pose>({ dwellMs: 500, findTarget, isInstant: (t) => (t.metadata as any)?.instant });
    const ctx = makeCtx();
    const result = b.onMove!(ctx, { x: 1, y: 1 });
    expect(result).toEqual({ pose: { x: 2, y: 3 }, snap: target });
  });

  it('does not snap until dwell elapses', () => {
    const target: SnapTarget<Pose> = { parentId: 'box', slotPose: { x: 2, y: 3 } };
    const findTarget = vi.fn().mockReturnValue(target);
    const b = snapToContainer<Pose>({ dwellMs: 500, findTarget });
    const ctx = makeCtx();
    const r1 = b.onMove!(ctx, { x: 1, y: 1 });
    expect(r1).toBeUndefined();
    vi.advanceTimersByTime(499);
    const r2 = b.onMove!(ctx, { x: 1, y: 1 });
    expect(r2).toBeUndefined();
  });

  it('snaps after dwell elapses on next onMove call', () => {
    const target: SnapTarget<Pose> = { parentId: 'box', slotPose: { x: 2, y: 3 } };
    const findTarget = vi.fn().mockReturnValue(target);
    const b = snapToContainer<Pose>({ dwellMs: 500, findTarget });
    const ctx = makeCtx();
    b.onMove!(ctx, { x: 1, y: 1 });
    vi.advanceTimersByTime(500);
    const r = b.onMove!(ctx, { x: 1, y: 1 });
    expect(r).toEqual({ pose: { x: 2, y: 3 }, snap: target });
  });

  it('moving away from target before dwell cancels timer', () => {
    const target1: SnapTarget<Pose> = { parentId: 'box1', slotPose: { x: 2, y: 3 } };
    const findTarget = vi.fn().mockReturnValueOnce(target1).mockReturnValue(null);
    const b = snapToContainer<Pose>({ dwellMs: 500, findTarget });
    const ctx = makeCtx();
    b.onMove!(ctx, { x: 1, y: 1 });
    vi.advanceTimersByTime(200);
    b.onMove!(ctx, { x: 10, y: 10 });
    vi.advanceTimersByTime(500);
    const r = b.onMove!(ctx, { x: 10, y: 10 });
    expect(r?.snap ?? null).toBeNull();
  });

  it('onEnd emits [TransformOp, ReparentOp] when snapped to a new parent', () => {
    const target: SnapTarget<Pose> = { parentId: 'box', slotPose: { x: 2, y: 3 } };
    const b = snapToContainer<Pose>({ dwellMs: 0, findTarget: () => target });
    const ctx = makeCtx();
    b.onMove!(ctx, { x: 1, y: 1 });
    ctx.snap = target;
    const ops = b.onEnd!(ctx);
    expect(Array.isArray(ops)).toBe(true);
    expect(ops!.length).toBe(2);
    expect((ops![0] as any).label ?? '').toMatch(/move|Move/i);
  });

  it('onEnd emits only TransformOp when snapped target equals old parent', () => {
    const target: SnapTarget<Pose> = { parentId: 'oldParent', slotPose: { x: 2, y: 3 } };
    const b = snapToContainer<Pose>({ dwellMs: 0, findTarget: () => target });
    const ctx = makeCtx();
    b.onMove!(ctx, { x: 1, y: 1 });
    ctx.snap = target;
    const ops = b.onEnd!(ctx);
    expect(ops!.length).toBe(1);
  });

  it('onEnd defers (returns undefined) when no snap is active', () => {
    const b = snapToContainer<Pose>({ dwellMs: 0, findTarget: () => null });
    const ctx = makeCtx();
    expect(b.onEnd!(ctx)).toBeUndefined();
  });
});
