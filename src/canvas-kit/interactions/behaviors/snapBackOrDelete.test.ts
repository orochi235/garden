import { describe, expect, it } from 'vitest';
import { snapBackOrDelete } from './snapBackOrDelete';
import type { GestureContext } from '../types';

interface Pose { x: number; y: number }

function ctx(originPose: Pose, currentPose: Pose, objectsById: Record<string, any> = {}): GestureContext<Pose> {
  return {
    draggedIds: ['a'],
    origin: new Map([['a', originPose]]),
    current: new Map([['a', currentPose]]),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false },
    pointer: { worldX: currentPose.x, worldY: currentPose.y, clientX: 0, clientY: 0 },
    adapter: {
      getObject: (id: string) => objectsById[id],
    } as any,
    scratch: {},
  };
}

describe('snapBackOrDelete', () => {
  it('returns null (snap-back) when within radius and policy is snap-back', () => {
    const b = snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'snap-back' });
    const c = ctx({ x: 5, y: 5 }, { x: 5.5, y: 5.2 });
    expect(b.onEnd!(c)).toBeNull();
  });

  it('returns null when within radius and policy is delete', () => {
    const b = snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'delete' });
    const c = ctx({ x: 5, y: 5 }, { x: 5.5, y: 5.2 });
    expect(b.onEnd!(c)).toBeNull();
  });

  it('returns [DeleteOp] when outside radius and policy is delete', () => {
    const b = snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'delete' });
    const obj = { id: 'a', x: 0, y: 0 };
    const c = ctx({ x: 5, y: 5 }, { x: 50, y: 50 }, { a: obj });
    const ops = b.onEnd!(c);
    expect(Array.isArray(ops)).toBe(true);
    expect((ops as any[])[0].label).toMatch(/delete/i);
  });

  it('returns undefined when outside radius and policy is snap-back', () => {
    const b = snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'snap-back' });
    const c = ctx({ x: 5, y: 5 }, { x: 50, y: 50 });
    expect(b.onEnd!(c)).toBeUndefined();
  });

  it('defers (returns undefined) when a snap is active', () => {
    const b = snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'delete' });
    const c = ctx({ x: 5, y: 5 }, { x: 50, y: 50 });
    c.snap = { parentId: 'box', slotPose: { x: 0, y: 0 } };
    expect(b.onEnd!(c)).toBeUndefined();
  });
});
