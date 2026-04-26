import type { Point2D, ShapePath } from './types';
import { lineTo, cubicTo, closedPath } from './types';

/** Create a rectangle ShapePath from origin (x,y) and size (w,h). */
export function rectPath(x: number, y: number, w: number, h: number): ShapePath {
  return closedPath(
    { x, y },
    [
      lineTo(x + w, y),
      lineTo(x + w, y + h),
      lineTo(x, y + h),
    ],
  );
}

/**
 * Create an ellipse ShapePath using 4 cubic Bezier arcs.
 * Uses the standard kappa approximation (4/3 * (sqrt(2) - 1) ≈ 0.5523).
 */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): ShapePath {
  const k = 0.5522847498;
  const kx = rx * k;
  const ky = ry * k;

  return closedPath(
    { x: cx + rx, y: cy },
    [
      // Top-right arc
      cubicTo(cx + rx, cy - ky, cx + kx, cy - ry, cx, cy - ry),
      // Top-left arc
      cubicTo(cx - kx, cy - ry, cx - rx, cy - ky, cx - rx, cy),
      // Bottom-left arc
      cubicTo(cx - rx, cy + ky, cx - kx, cy + ry, cx, cy + ry),
      // Bottom-right arc
      cubicTo(cx + kx, cy + ry, cx + rx, cy + ky, cx + rx, cy),
    ],
  );
}

/** Create a ShapePath from an array of vertices (all line segments). */
export function polygonPath(points: Point2D[]): ShapePath {
  if (points.length < 3) {
    return closedPath({ x: 0, y: 0 }, []);
  }
  return closedPath(
    { x: points[0].x, y: points[0].y },
    points.slice(1).map(p => lineTo(p.x, p.y)),
  );
}
