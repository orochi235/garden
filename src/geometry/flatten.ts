import type { Point2D, ShapePath } from './types';

/**
 * Flatten a ShapePath into a polyline by tessellating cubic Bezier segments
 * via adaptive De Casteljau subdivision. Line segments pass through unchanged.
 *
 * @param path   Closed shape path
 * @param tolerance  Max distance a chord may deviate from the curve (default 0.25)
 * @returns Array of points forming a closed polygon (no duplicate of start at end)
 */
export function flattenPath(path: ShapePath, tolerance = 0.25): Point2D[] {
  const pts: Point2D[] = [{ x: path.start.x, y: path.start.y }];
  let cur = path.start;

  for (const seg of path.segments) {
    if (seg.kind === 'line') {
      pts.push({ x: seg.x, y: seg.y });
      cur = { x: seg.x, y: seg.y };
    } else {
      // Adaptive subdivision of cubic Bezier
      subdivideCubic(
        cur.x, cur.y,
        seg.cp1x, seg.cp1y,
        seg.cp2x, seg.cp2y,
        seg.x, seg.y,
        tolerance * tolerance,
        pts,
      );
      cur = { x: seg.x, y: seg.y };
    }
  }

  return pts;
}

/**
 * Recursively subdivide a cubic Bezier until each chord is within tolerance
 * of the curve. Uses the flatness test: if the control points are within
 * tolerance of the line from start to end, output the endpoint directly.
 */
function subdivideCubic(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  tolSq: number,
  out: Point2D[],
): void {
  // Flatness test: max squared distance from control points to the chord
  if (isFlat(x0, y0, x1, y1, x2, y2, x3, y3, tolSq)) {
    out.push({ x: x3, y: y3 });
    return;
  }

  // De Casteljau split at t=0.5
  const mx01 = (x0 + x1) / 2, my01 = (y0 + y1) / 2;
  const mx12 = (x1 + x2) / 2, my12 = (y1 + y2) / 2;
  const mx23 = (x2 + x3) / 2, my23 = (y2 + y3) / 2;
  const mx012 = (mx01 + mx12) / 2, my012 = (my01 + my12) / 2;
  const mx123 = (mx12 + mx23) / 2, my123 = (my12 + my23) / 2;
  const mx0123 = (mx012 + mx123) / 2, my0123 = (my012 + my123) / 2;

  subdivideCubic(x0, y0, mx01, my01, mx012, my012, mx0123, my0123, tolSq, out);
  subdivideCubic(mx0123, my0123, mx123, my123, mx23, my23, x3, y3, tolSq, out);
}

/** Check if a cubic Bezier is flat enough to approximate with a line. */
function isFlat(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  tolSq: number,
): boolean {
  // Use distance of control points from the chord (start→end)
  return (
    pointToSegmentDistSq(x1, y1, x0, y0, x3, y3) <= tolSq &&
    pointToSegmentDistSq(x2, y2, x0, y0, x3, y3) <= tolSq
  );
}

/** Squared distance from point (px,py) to line segment (ax,ay)-(bx,by). */
function pointToSegmentDistSq(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx, cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}
