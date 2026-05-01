import { describe, expect, it } from 'vitest';
import { snapToGrid } from './snapToGrid';
import type { GestureContext } from '../../types';

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

describe('snapToGrid', () => {
  it('rounds x and y to the nearest cell', () => {
    const b = snapToGrid<Pose>({ cell: 1 });
    const result = b.onMove!(ctx(), { x: 1.4, y: 2.6 });
    expect(result).toEqual({ pose: { x: 1, y: 3 } });
  });

  it('preserves extra pose fields', () => {
    interface FullPose { x: number; y: number; widthFt: number }
    const b = snapToGrid<FullPose>({ cell: 0.5 });
    const result = b.onMove!(
      ctx() as unknown as GestureContext<FullPose>,
      { x: 0.3, y: 0.7, widthFt: 4 },
    );
    expect(result).toEqual({ pose: { x: 0.5, y: 0.5, widthFt: 4 } });
  });

  it('bypassKey suppresses snapping when held', () => {
    const b = snapToGrid<Pose>({ cell: 1, bypassKey: 'alt' });
    const result = b.onMove!(ctx({ alt: true }), { x: 1.4, y: 2.6 });
    expect(result).toBeUndefined();
  });

  it('bypassKey does not suppress when other modifier held', () => {
    const b = snapToGrid<Pose>({ cell: 1, bypassKey: 'alt' });
    const result = b.onMove!(ctx({ shift: true }), { x: 1.4, y: 2.6 });
    expect(result).toEqual({ pose: { x: 1, y: 3 } });
  });
});
