import { describe, expect, it, vi } from 'vitest';
import { composeSelectionPose, createSelectionOverlayLayer } from './selectionOverlay';

interface Pose {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RecordedCall {
  fn: string;
  args: number[];
}

interface StubCtx {
  ctx: CanvasRenderingContext2D;
  calls: RecordedCall[];
}

function makeStubCtx(): StubCtx {
  const calls: RecordedCall[] = [];
  const record = (fn: string) =>
    vi.fn((...args: number[]) => {
      calls.push({ fn, args });
    });
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    strokeRect: record('strokeRect'),
    fillRect: record('fillRect'),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('composeSelectionPose', () => {
  const stored: Record<string, Pose> = {
    a: { x: 0, y: 0, width: 10, height: 10 },
    b: { x: 50, y: 50, width: 20, height: 20 },
  };
  const getStoredPose = (id: string) => stored[id];

  it('prefers move overlay over resize overlay and stored', () => {
    const movedA: Pose = { x: 100, y: 100, width: 10, height: 10 };
    const resize = { id: 'a', currentPose: { x: 200, y: 200, width: 30, height: 30 } };
    const resolve = composeSelectionPose<Pose>({
      moveOverlay: { poses: new Map([['a', movedA]]) },
      resizeOverlay: resize,
      getStoredPose,
    });
    expect(resolve('a')).toBe(movedA);
  });

  it('uses resize overlay when move overlay does not cover the id', () => {
    const resizePose: Pose = { x: 200, y: 200, width: 30, height: 30 };
    const resolve = composeSelectionPose<Pose>({
      moveOverlay: { poses: new Map() },
      resizeOverlay: { id: 'a', currentPose: resizePose },
      getStoredPose,
    });
    expect(resolve('a')).toBe(resizePose);
    // Different id falls through to stored.
    expect(resolve('b')).toBe(stored.b);
  });

  it('falls through to stored pose when both overlays absent', () => {
    const resolve = composeSelectionPose<Pose>({
      moveOverlay: null,
      resizeOverlay: null,
      getStoredPose,
    });
    expect(resolve('a')).toBe(stored.a);
    expect(resolve('b')).toBe(stored.b);
  });

  it('handles undefined overlay opts as falsy', () => {
    const resolve = composeSelectionPose<Pose>({ getStoredPose });
    expect(resolve('a')).toBe(stored.a);
  });
});

describe('createSelectionOverlayLayer', () => {
  it('exposes the expected RenderLayer id/label', () => {
    const layer = createSelectionOverlayLayer<Pose>({
      getSelection: () => [],
      getPose: () => null,
    });
    expect(layer.id).toBe('selection-overlay');
    expect(typeof layer.label).toBe('string');
  });

  it('renders nothing when selection is empty', () => {
    const { ctx, calls } = makeStubCtx();
    const layer = createSelectionOverlayLayer<Pose>({
      getSelection: () => [],
      getPose: () => ({ x: 0, y: 0, width: 10, height: 10 }),
    });
    layer.draw(ctx, undefined);
    expect(calls).toEqual([]);
  });

  it('skips ids whose getPose returns null', () => {
    const { ctx, calls } = makeStubCtx();
    const poses: Record<string, Pose | null> = {
      a: { x: 10, y: 20, width: 30, height: 40 },
      b: null,
    };
    const layer = createSelectionOverlayLayer<Pose>({
      getSelection: () => ['a', 'b'],
      getPose: (id) => poses[id],
    });
    layer.draw(ctx, undefined);
    // 1 outline strokeRect for "a" + 4 handle strokeRects for "a" = 5 strokeRects.
    const strokeRects = calls.filter((c) => c.fn === 'strokeRect');
    const fillRects = calls.filter((c) => c.fn === 'fillRect');
    expect(strokeRects).toHaveLength(5);
    expect(fillRects).toHaveLength(4);
  });

  it('draws outline rect with default 1-px pad', () => {
    const { ctx, calls } = makeStubCtx();
    const layer = createSelectionOverlayLayer<Pose>({
      getSelection: () => ['a'],
      getPose: () => ({ x: 10, y: 20, width: 30, height: 40 }),
      handles: false,
    });
    layer.draw(ctx, undefined);
    const strokeRects = calls.filter((c) => c.fn === 'strokeRect');
    expect(strokeRects).toHaveLength(1);
    expect(strokeRects[0].args).toEqual([9, 19, 32, 42]);
  });

  it('renders outline-only when handles: false', () => {
    const { ctx, calls } = makeStubCtx();
    const layer = createSelectionOverlayLayer<Pose>({
      getSelection: () => ['a'],
      getPose: () => ({ x: 0, y: 0, width: 10, height: 10 }),
      handles: false,
    });
    layer.draw(ctx, undefined);
    expect(calls.filter((c) => c.fn === 'fillRect')).toHaveLength(0);
    expect(calls.filter((c) => c.fn === 'strokeRect')).toHaveLength(1);
  });

  it('uses handlesOf override when provided', () => {
    const { ctx, calls } = makeStubCtx();
    const customHandles = [
      { x: 5, y: 5 },
      { x: 15, y: 15 },
    ];
    const layer = createSelectionOverlayLayer<Pose>({
      getSelection: () => ['a'],
      getPose: () => ({ x: 0, y: 0, width: 10, height: 10 }),
      handlesOf: () => customHandles,
    });
    layer.draw(ctx, undefined);
    const fillRects = calls.filter((c) => c.fn === 'fillRect');
    // 2 custom handles instead of default 4.
    expect(fillRects).toHaveLength(2);
    // Default size is 8 -> half=4 -> top-left at (1,1) and (11,11).
    expect(fillRects[0].args).toEqual([1, 1, 8, 8]);
    expect(fillRects[1].args).toEqual([11, 11, 8, 8]);
  });

  it('honors custom handle size and outline pad', () => {
    const { ctx, calls } = makeStubCtx();
    const layer = createSelectionOverlayLayer<Pose>({
      getSelection: () => ['a'],
      getPose: () => ({ x: 0, y: 0, width: 10, height: 10 }),
      outline: { stroke: '#fff', width: 3, pad: 2 },
      handles: { size: 4, fill: '#000', stroke: '#fff', strokeWidth: 1 },
    });
    layer.draw(ctx, undefined);
    const outlineCall = calls.filter((c) => c.fn === 'strokeRect')[0];
    expect(outlineCall.args).toEqual([-2, -2, 14, 14]);
    const fillRects = calls.filter((c) => c.fn === 'fillRect');
    // Default 4 corners, size 4 -> half=2 -> first at (-2,-2,4,4).
    expect(fillRects[0].args).toEqual([-2, -2, 4, 4]);
  });
});
