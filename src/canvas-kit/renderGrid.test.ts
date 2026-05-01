import { describe, expect, it, vi } from 'vitest';
import { renderGrid } from './renderGrid';

interface Call {
  fn: string;
  args: unknown[];
  strokeStyle?: string;
  fillStyle?: string;
  lineWidth?: number;
}

function makeCtx() {
  const calls: Call[] = [];
  const state = { strokeStyle: '', fillStyle: '', lineWidth: 0 };
  const rec = (fn: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({
        fn,
        args,
        strokeStyle: state.strokeStyle,
        fillStyle: state.fillStyle,
        lineWidth: state.lineWidth,
      });
    });
  const ctx = {
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(v: string) { state.strokeStyle = v; },
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v: string) { state.fillStyle = v; },
    get lineWidth() { return state.lineWidth; },
    set lineWidth(v: number) { state.lineWidth = v; },
    clearRect: rec('clearRect'),
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    stroke: rec('stroke'),
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('renderGrid', () => {
  it('clears the canvas first', () => {
    const { ctx, calls } = makeCtx();
    renderGrid(ctx, {
      widthFt: 10,
      heightFt: 10,
      cellSizeFt: 1,
      view: { panX: 0, panY: 0, zoom: 50 },
      canvasWidth: 500,
      canvasHeight: 500,
    });
    expect(calls[0].fn).toBe('clearRect');
    expect(calls[0].args).toEqual([0, 0, 500, 500]);
  });

  it('draws grid lines covering visible world space', () => {
    const { ctx, calls } = makeCtx();
    // 100x100 canvas, zoom=10, pan=0 -> world spans 0..10 -> with cellSize 1, 11 vertical + 11 horizontal lines
    renderGrid(ctx, {
      widthFt: 5,
      heightFt: 5,
      cellSizeFt: 1,
      view: { panX: 0, panY: 0, zoom: 10 },
      canvasWidth: 100,
      canvasHeight: 100,
    });
    const strokes = calls.filter((c) => c.fn === 'stroke');
    expect(strokes.length).toBeGreaterThanOrEqual(22);
  });

  it('draws garden background fill and border at world (0,0)', () => {
    const { ctx, calls } = makeCtx();
    renderGrid(ctx, {
      widthFt: 4,
      heightFt: 3,
      cellSizeFt: 1,
      view: { panX: 50, panY: 60, zoom: 10 },
      canvasWidth: 200,
      canvasHeight: 200,
    });
    const fillRect = calls.find((c) => c.fn === 'fillRect');
    expect(fillRect).toBeDefined();
    // origin at (panX, panY) = (50, 60); size = (4*10, 3*10) = (40, 30)
    expect(fillRect!.args).toEqual([50, 60, 40, 30]);

    const strokeRect = calls.find((c) => c.fn === 'strokeRect');
    expect(strokeRect).toBeDefined();
    expect(strokeRect!.args).toEqual([50, 60, 40, 30]);
    // border style
    expect(strokeRect!.lineWidth).toBe(2);
  });

  it('extends grid lines past visible bounds via floor/ceil snapping', () => {
    const { ctx, calls } = makeCtx();
    // small pan so grid lines start at negative world coords
    renderGrid(ctx, {
      widthFt: 10,
      heightFt: 10,
      cellSizeFt: 1,
      view: { panX: 5, panY: 5, zoom: 10 },
      canvasWidth: 100,
      canvasHeight: 100,
    });
    const strokes = calls.filter((c) => c.fn === 'stroke');
    // worldLeft = -0.5, worldRight = 9.5 -> startX=-1, endX=10 -> 12 vertical
    // similar for horizontal -> 12 + 12 = 24
    expect(strokes.length).toBeGreaterThanOrEqual(24);
  });
});
