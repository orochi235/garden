import { describe, expect, it } from 'vitest';
import { snapToGrid } from './snapToGrid';
import type {
  GestureContext,
  InsertProposed,
  ModifierState,
} from '../../types';

interface P { x: number; y: number }

function ctx(start: P, mods: Partial<ModifierState> = {}): GestureContext<P> {
  return {
    draggedIds: ['gesture'],
    origin: new Map([['gesture', start]]),
    current: new Map([['gesture', start]]),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false, ...mods },
    pointer: { worldX: 0, worldY: 0, clientX: 0, clientY: 0 },
    adapter: {} as never,
    scratch: {},
  };
}

function proposed(start: P, current: P): InsertProposed<P> {
  return { start, current };
}

describe('insert/snapToGrid', () => {
  const b = snapToGrid<P>({ cell: 1 });

  it('onStart snaps origin to grid', () => {
    const c = ctx({ x: 0.7, y: 0.3 });
    b.onStart!(c);
    expect(c.origin.get('gesture')).toEqual({ x: 1, y: 0 });
  });

  it('onMove returns snapped current; passes start through', () => {
    const c = ctx({ x: 1, y: 0 });
    const r = b.onMove!(c, proposed({ x: 1, y: 0 }, { x: 4.6, y: 2.3 }));
    expect(r).toEqual({ current: { x: 5, y: 2 } });
  });

  it('bypassKey skips both', () => {
    const b2 = snapToGrid<P>({ cell: 1, bypassKey: 'alt' });
    const c = ctx({ x: 0.7, y: 0.3 }, { alt: true });
    b2.onStart!(c);
    expect(c.origin.get('gesture')).toEqual({ x: 0.7, y: 0.3 }); // unchanged
    const r = b2.onMove!(c, proposed({ x: 0.7, y: 0.3 }, { x: 4.6, y: 2.3 }));
    expect(r).toBeUndefined();
  });
});
