import { describe, expect, it } from 'vitest';
import { snapToGrid } from './snapToGrid';
import type {
  GestureContext,
  ResizeAnchor,
  ResizePose,
  ResizeProposed,
  ModifierState,
} from '../../types';

interface P extends ResizePose {}

function ctx(origin: P, mods: Partial<ModifierState> = {}): GestureContext<P> {
  return {
    draggedIds: ['a'],
    origin: new Map([['a', origin]]),
    current: new Map(),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false, ...mods },
    pointer: { worldX: 0, worldY: 0, clientX: 0, clientY: 0 },
    adapter: {} as never,
    scratch: {},
  };
}

function proposed(pose: P, anchor: ResizeAnchor): ResizeProposed<P> {
  return { pose, anchor };
}

describe('resize/snapToGrid', () => {
  const b = snapToGrid<P>({ cell: 1 });

  it('east anchor=min: snaps east edge by adjusting width', () => {
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 4 }),
      proposed({ x: 0, y: 0, width: 4.7, height: 4 }, { x: 'min', y: 'free' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 5, height: 4 } });
  });

  it('west anchor=max: snaps west edge by adjusting x and width', () => {
    // Original right is at x+width = 0+10 = 10; west drag to x=2.4 yields width=7.6.
    // Snap x to 2; width becomes 10-2 = 8.
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 10, height: 4 }),
      proposed({ x: 2.4, y: 0, width: 7.6, height: 4 }, { x: 'max', y: 'free' }),
    );
    expect(r).toEqual({ pose: { x: 2, y: 0, width: 8, height: 4 } });
  });

  it('south anchor: snaps south edge by adjusting height', () => {
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 4 }),
      proposed({ x: 0, y: 0, width: 4, height: 4.7 }, { x: 'free', y: 'min' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 4, height: 5 } });
  });

  it('north anchor: snaps north edge by adjusting y and height', () => {
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 10 }),
      proposed({ x: 0, y: 2.4, width: 4, height: 7.6 }, { x: 'free', y: 'max' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 2, width: 4, height: 8 } });
  });

  it('corner (se = min/min): snaps both axes', () => {
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 4 }),
      proposed({ x: 0, y: 0, width: 4.7, height: 4.7 }, { x: 'min', y: 'min' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 5, height: 5 } });
  });

  it('suspendBelowDim default true: origin.width < cell skips x-axis snap', () => {
    // origin width = 0.5 < cell = 1. East drag to width=0.7 must NOT snap.
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 0.5, height: 4 }),
      proposed({ x: 0, y: 0, width: 0.7, height: 4 }, { x: 'min', y: 'free' }),
    );
    expect(r).toBeUndefined();
  });

  it('suspendBelowDim default true: origin.height < cell skips y-axis only', () => {
    // origin height < cell, but width >= cell. East+south drag: x snaps, y doesn't.
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 0.5 }),
      proposed({ x: 0, y: 0, width: 4.7, height: 0.7 }, { x: 'min', y: 'min' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 5, height: 0.7 } });
  });

  it('suspendBelowDim=false: snaps even when origin dim < cell', () => {
    const b2 = snapToGrid<P>({ cell: 1, suspendBelowDim: false });
    const r = b2.onMove!(
      ctx({ x: 0, y: 0, width: 0.5, height: 4 }),
      proposed({ x: 0, y: 0, width: 0.7, height: 4 }, { x: 'min', y: 'free' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 1, height: 4 } });
  });

  it('bypassKey skips snap entirely', () => {
    const b2 = snapToGrid<P>({ cell: 1, bypassKey: 'alt' });
    const r = b2.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 4 }, { alt: true }),
      proposed({ x: 0, y: 0, width: 4.7, height: 4.7 }, { x: 'min', y: 'min' }),
    );
    expect(r).toBeUndefined();
  });

  it('free axis: never snapped', () => {
    const r = b.onMove!(
      ctx({ x: 0, y: 0, width: 4, height: 4 }),
      proposed({ x: 0, y: 0, width: 4.7, height: 4.7 }, { x: 'free', y: 'min' }),
    );
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 4.7, height: 5 } });
  });
});
