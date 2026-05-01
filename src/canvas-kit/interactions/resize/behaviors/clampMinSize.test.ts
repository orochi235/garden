import { describe, expect, it } from 'vitest';
import { clampMinSize } from './clampMinSize';
import type {
  GestureContext,
  ResizeAnchor,
  ResizePose,
  ResizeProposed,
} from '../../types';

interface P extends ResizePose {}

function ctx(): GestureContext<P> {
  return {
    draggedIds: ['a'],
    origin: new Map([['a', { x: 0, y: 0, width: 10, height: 10 }]]),
    current: new Map(),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false },
    pointer: { worldX: 0, worldY: 0, clientX: 0, clientY: 0 },
    adapter: {} as never,
    scratch: {},
  };
}

function proposed(pose: P, anchor: ResizeAnchor): ResizeProposed<P> {
  return { pose, anchor };
}

describe('clampMinSize', () => {
  const b = clampMinSize<P>({ minWidth: 1, minHeight: 1 });

  it('east edge drag: width below min stops dragged edge; x stays at anchor', () => {
    // anchor x = 'min' means the west edge is the anchor; east edge moves.
    const r = b.onMove!(ctx(), proposed({ x: 0, y: 0, width: 0.5, height: 5 }, { x: 'min', y: 'free' }));
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 1, height: 5 } });
  });

  it('west edge drag: width below min freezes anchor (max edge); shifts x to anchor - min', () => {
    // anchor x = 'max' means east edge is anchor (originally at x+width = 0+10 = 10).
    // Dragging west toward x=9.5 yields width 0.5; clamp stops dragged west edge at x=9, width=1.
    const r = b.onMove!(ctx(), proposed({ x: 9.5, y: 0, width: 0.5, height: 5 }, { x: 'max', y: 'free' }));
    expect(r).toEqual({ pose: { x: 9, y: 0, width: 1, height: 5 } });
  });

  it('south edge drag: height below min stops dragged edge', () => {
    const r = b.onMove!(ctx(), proposed({ x: 0, y: 0, width: 5, height: 0.4 }, { x: 'free', y: 'min' }));
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 5, height: 1 } });
  });

  it('north edge drag: height below min freezes anchor (south); shifts y', () => {
    const r = b.onMove!(ctx(), proposed({ x: 0, y: 9.5, width: 5, height: 0.5 }, { x: 'free', y: 'max' }));
    expect(r).toEqual({ pose: { x: 0, y: 9, width: 5, height: 1 } });
  });

  it('corner drag (nw): both axes clamp independently', () => {
    const r = b.onMove!(ctx(), proposed({ x: 9.5, y: 9.5, width: 0.5, height: 0.5 }, { x: 'max', y: 'max' }));
    expect(r).toEqual({ pose: { x: 9, y: 9, width: 1, height: 1 } });
  });

  it('corner drag (se): both axes clamp at origin', () => {
    const r = b.onMove!(ctx(), proposed({ x: 0, y: 0, width: 0.4, height: 0.4 }, { x: 'min', y: 'min' }));
    expect(r).toEqual({ pose: { x: 0, y: 0, width: 1, height: 1 } });
  });

  it('above min: passes through unchanged', () => {
    const r = b.onMove!(ctx(), proposed({ x: 1, y: 1, width: 5, height: 5 }, { x: 'min', y: 'min' }));
    expect(r).toBeUndefined();
  });

  it('free axis: never clamps that axis even when dimension is small', () => {
    // anchor.x = 'free' means x-axis isn't being dragged; resize behavior shouldn't clamp it.
    const r = b.onMove!(ctx(), proposed({ x: 0, y: 0, width: 0.1, height: 5 }, { x: 'free', y: 'free' }));
    expect(r).toBeUndefined();
  });
});
