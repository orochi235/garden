import { describe, expect, it } from 'vitest';
import {
  shapeUnion,
  shapeDifference,
  shapeIntersection,
  shapeXor,
  shapeOffset,
  shapeArea,
  shapeBounds,
  pointInShape,
} from './ops';
import { rectPath, ellipsePath } from './shapes';

describe('boolean ops', () => {
  it('unions two overlapping rectangles', () => {
    const a = rectPath(0, 0, 4, 4);
    const b = rectPath(2, 2, 4, 4);
    const result = shapeUnion([a, b]);
    expect(result.length).toBe(1);
    // Union area should be 28 (4*4 + 4*4 - 2*2 overlap)
    expect(shapeArea(result[0])).toBeCloseTo(28, 0);
  });

  it('differences a small rect from a large rect', () => {
    const big = rectPath(0, 0, 10, 10);
    const hole = rectPath(3, 3, 4, 4);
    const result = shapeDifference(big, [hole]);
    // Remaining area = 100 - 16 = 84
    const totalArea = result.reduce((sum, p) => sum + shapeArea(p), 0);
    expect(totalArea).toBeCloseTo(84, 0);
  });

  it('intersects two overlapping rectangles', () => {
    const a = rectPath(0, 0, 4, 4);
    const b = rectPath(2, 2, 4, 4);
    const result = shapeIntersection([a], [b]);
    expect(result.length).toBe(1);
    expect(shapeArea(result[0])).toBeCloseTo(4, 0);
  });

  it('xors two overlapping rectangles', () => {
    const a = rectPath(0, 0, 4, 4);
    const b = rectPath(2, 2, 4, 4);
    const result = shapeXor([a], [b]);
    const totalArea = result.reduce((sum, p) => sum + shapeArea(p), 0);
    // XOR = union - intersection = 28 - 4 = 24
    expect(totalArea).toBeCloseTo(24, 0);
  });

  it('returns empty array for non-overlapping intersection', () => {
    const a = rectPath(0, 0, 2, 2);
    const b = rectPath(5, 5, 2, 2);
    const result = shapeIntersection([a], [b]);
    expect(result).toHaveLength(0);
  });
});

describe('shapeOffset', () => {
  it('expands a rectangle outward', () => {
    const r = rectPath(0, 0, 4, 4);
    const result = shapeOffset(r, 1);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const expanded = shapeArea(result[0]);
    // Expanded rect should be larger (exact shape depends on join type)
    expect(expanded).toBeGreaterThan(16);
  });

  it('shrinks a rectangle inward with negative delta', () => {
    const r = rectPath(0, 0, 10, 10);
    const result = shapeOffset(r, -2);
    expect(result.length).toBe(1);
    expect(shapeArea(result[0])).toBeCloseTo(36, 0);
  });
});

describe('shapeArea', () => {
  it('computes area of a rectangle', () => {
    const r = rectPath(0, 0, 5, 3);
    expect(shapeArea(r)).toBeCloseTo(15, 1);
  });

  it('computes area of an ellipse', () => {
    const e = ellipsePath(0, 0, 3, 3);
    expect(shapeArea(e)).toBeCloseTo(Math.PI * 9, 0);
  });
});

describe('shapeBounds', () => {
  it('returns the AABB of a rectangle', () => {
    const r = rectPath(2, 3, 4, 5);
    const b = shapeBounds(r);
    expect(b).toEqual({ x: 2, y: 3, width: 4, height: 5 });
  });
});

describe('pointInShape', () => {
  it('detects a point inside a rectangle', () => {
    const r = rectPath(0, 0, 4, 4);
    expect(pointInShape(2, 2, r)).toBe(true);
  });

  it('detects a point outside a rectangle', () => {
    const r = rectPath(0, 0, 4, 4);
    expect(pointInShape(5, 5, r)).toBe(false);
  });

  it('detects a point inside an ellipse', () => {
    const e = ellipsePath(5, 5, 3, 3);
    expect(pointInShape(5, 5, e)).toBe(true);
  });

  it('detects a point outside an ellipse', () => {
    const e = ellipsePath(5, 5, 3, 3);
    expect(pointInShape(0, 0, e)).toBe(false);
  });
});
