import { describe, expect, it, vi } from 'vitest';
import { snap } from './snap';
import type { GestureContext, SnapStrategy } from '../types';

interface Pose { x: number; y: number }

function ctx(modifiers: Partial<GestureContext<Pose>['modifiers']> = {}): GestureContext<Pose> {
  return {
    draggedIds: ['a'],
    origin: new Map(),
    current: new Map(),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false, ...modifiers },
    pointer: { worldX: 0, worldY: 0, clientX: 0, clientY: 0 },
    adapter: {} as any,
    scratch: {},
  };
}

function fixedStrategy(result: Pose | null): SnapStrategy<Pose> {
  return { snap: vi.fn().mockReturnValue(result) };
}

describe('snap', () => {
  it('forwards strategy result as { pose }', () => {
    const strategy = fixedStrategy({ x: 2, y: 4 });
    const b = snap(strategy);
    const result = b.onMove!(ctx(), { x: 1.7, y: 3.9 });
    expect(result).toEqual({ pose: { x: 2, y: 4 } });
  });

  it('bypassKey suppresses strategy when held', () => {
    const strategy = fixedStrategy({ x: 2, y: 4 });
    const b = snap(strategy, { bypassKey: 'alt' });
    const result = b.onMove!(ctx({ alt: true }), { x: 1.7, y: 3.9 });
    expect(result).toBeUndefined();
    expect((strategy.snap as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('bypassKey does not suppress when a different modifier is held', () => {
    const strategy = fixedStrategy({ x: 2, y: 4 });
    const b = snap(strategy, { bypassKey: 'alt' });
    const result = b.onMove!(ctx({ shift: true }), { x: 1.7, y: 3.9 });
    expect(result).toEqual({ pose: { x: 2, y: 4 } });
  });

  it('strategy returning null is a no-op (pipeline forwards original)', () => {
    const strategy = fixedStrategy(null);
    const b = snap(strategy);
    const result = b.onMove!(ctx(), { x: 1.7, y: 3.9 });
    expect(result).toBeUndefined();
  });

  it('passes context to the strategy', () => {
    const strategy: SnapStrategy<Pose> = { snap: vi.fn().mockReturnValue({ x: 0, y: 0 }) };
    const b = snap(strategy);
    const c = ctx({ shift: true });
    b.onMove!(c, { x: 1, y: 2 });
    expect(strategy.snap).toHaveBeenCalledWith({ x: 1, y: 2 }, c);
  });
});
