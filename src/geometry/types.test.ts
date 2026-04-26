import { describe, expect, it } from 'vitest';
import {
  lineTo,
  cubicTo,
  closedPath,
  type ShapePath,
  type LineSeg,
  type CubicSeg,
} from './types';

describe('geometry types', () => {
  it('creates a line segment', () => {
    const seg = lineTo(3, 4);
    expect(seg).toEqual({ kind: 'line', x: 3, y: 4 });
  });

  it('creates a cubic bezier segment', () => {
    const seg = cubicTo(1, 2, 3, 4, 5, 6);
    expect(seg).toEqual({
      kind: 'cubic',
      cp1x: 1, cp1y: 2,
      cp2x: 3, cp2y: 4,
      x: 5, y: 6,
    });
  });

  it('creates a closed path', () => {
    const path = closedPath(
      { x: 0, y: 0 },
      [lineTo(4, 0), lineTo(4, 3), lineTo(0, 3)],
    );
    expect(path.start).toEqual({ x: 0, y: 0 });
    expect(path.segments).toHaveLength(3);
  });

  it('exposes the endpoint of each segment kind', () => {
    const line: LineSeg = lineTo(1, 2);
    const cubic: CubicSeg = cubicTo(0, 0, 0, 0, 5, 6);
    expect(line.x).toBe(1);
    expect(cubic.x).toBe(5);
  });
});
