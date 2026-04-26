import { describe, expect, it } from 'vitest';
import { rectPath, ellipsePath, polygonPath } from './shapes';
import { flattenPath } from './flatten';

describe('rectPath', () => {
  it('creates a rectangle as 4 line segments', () => {
    const r = rectPath(1, 2, 4, 3);
    expect(r.start).toEqual({ x: 1, y: 2 });
    expect(r.segments).toHaveLength(3);
    expect(r.segments.every(s => s.kind === 'line')).toBe(true);
    const pts = flattenPath(r);
    expect(pts).toEqual([
      { x: 1, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 5 },
      { x: 1, y: 5 },
    ]);
  });
});

describe('ellipsePath', () => {
  it('creates an ellipse from cubic Bezier arcs', () => {
    const e = ellipsePath(5, 5, 3, 2);
    // 4 cubic segments for a full ellipse approximation
    expect(e.segments).toHaveLength(4);
    expect(e.segments.every(s => s.kind === 'cubic')).toBe(true);
  });

  it('produces a circle when rx === ry', () => {
    const c = ellipsePath(0, 0, 5, 5);
    const pts = flattenPath(c, 0.01);
    // All points should be ~5 units from center
    for (const p of pts) {
      const dist = Math.sqrt(p.x ** 2 + p.y ** 2);
      expect(dist).toBeCloseTo(5, 1);
    }
  });
});

describe('polygonPath', () => {
  it('creates a path from a point array', () => {
    const tri = polygonPath([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 3 },
    ]);
    expect(tri.start).toEqual({ x: 0, y: 0 });
    expect(tri.segments).toHaveLength(2);
    const pts = flattenPath(tri);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 3 },
    ]);
  });
});
