import { describe, expect, it } from 'vitest';
import { flattenPath } from './flatten';
import { closedPath, lineTo, cubicTo } from './types';

describe('flattenPath', () => {
  it('returns vertices for an all-line path unchanged', () => {
    const rect = closedPath(
      { x: 0, y: 0 },
      [lineTo(4, 0), lineTo(4, 3), lineTo(0, 3)],
    );
    const pts = flattenPath(rect);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ]);
  });

  it('tessellates a cubic bezier into multiple points', () => {
    const path = closedPath(
      { x: 0, y: 0 },
      [cubicTo(0, 10, 10, 10, 10, 0)],
    );
    const pts = flattenPath(path, 0.1);
    // Should produce more than just start+end
    expect(pts.length).toBeGreaterThan(2);
    // First point is start
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    // Last point is the curve endpoint
    expect(pts[pts.length - 1]).toEqual({ x: 10, y: 0 });
  });

  it('produces fewer points with larger tolerance', () => {
    const path = closedPath(
      { x: 0, y: 0 },
      [cubicTo(0, 10, 10, 10, 10, 0)],
    );
    const fine = flattenPath(path, 0.01);
    const coarse = flattenPath(path, 1.0);
    expect(fine.length).toBeGreaterThan(coarse.length);
  });

  it('handles a path mixing lines and curves', () => {
    const path = closedPath(
      { x: 0, y: 0 },
      [
        lineTo(5, 0),
        cubicTo(5, 3, 3, 5, 0, 5),
        lineTo(0, 0),
      ],
    );
    const pts = flattenPath(path, 0.1);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[1]).toEqual({ x: 5, y: 0 });
    // Curve portion adds intermediate points
    expect(pts.length).toBeGreaterThan(4);
  });
});
