import { describe, expect, it } from 'vitest';
import { traceShapePath, tracePolyline } from './canvas';
import { rectPath } from './shapes';
import { closedPath, cubicTo } from './types';

/** Minimal recorder that captures canvas method calls. */
function mockCtx() {
  const calls: { method: string; args: number[] }[] = [];
  return {
    calls,
    moveTo(x: number, y: number) { calls.push({ method: 'moveTo', args: [x, y] }); },
    lineTo(x: number, y: number) { calls.push({ method: 'lineTo', args: [x, y] }); },
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
      calls.push({ method: 'bezierCurveTo', args: [cp1x, cp1y, cp2x, cp2y, x, y] });
    },
    closePath() { calls.push({ method: 'closePath', args: [] }); },
  };
}

describe('traceShapePath', () => {
  it('traces a rectangle with moveTo + 3 lineTo + closePath', () => {
    const ctx = mockCtx();
    traceShapePath(ctx, rectPath(1, 2, 3, 4));
    expect(ctx.calls).toEqual([
      { method: 'moveTo', args: [1, 2] },
      { method: 'lineTo', args: [4, 2] },
      { method: 'lineTo', args: [4, 6] },
      { method: 'lineTo', args: [1, 6] },
      { method: 'closePath', args: [] },
    ]);
  });

  it('traces curves with bezierCurveTo', () => {
    const ctx = mockCtx();
    const path = closedPath({ x: 0, y: 0 }, [cubicTo(1, 2, 3, 4, 5, 6)]);
    traceShapePath(ctx, path);
    expect(ctx.calls[0]).toEqual({ method: 'moveTo', args: [0, 0] });
    expect(ctx.calls[1]).toEqual({ method: 'bezierCurveTo', args: [1, 2, 3, 4, 5, 6] });
    expect(ctx.calls[2]).toEqual({ method: 'closePath', args: [] });
  });
});

describe('tracePolyline', () => {
  it('traces a point array as moveTo + lineTo + closePath', () => {
    const ctx = mockCtx();
    tracePolyline(ctx, [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }]);
    expect(ctx.calls).toEqual([
      { method: 'moveTo', args: [0, 0] },
      { method: 'lineTo', args: [3, 0] },
      { method: 'lineTo', args: [3, 4] },
      { method: 'closePath', args: [] },
    ]);
  });
});
