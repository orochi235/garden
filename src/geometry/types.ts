/** A 2D point. */
export interface Point2D {
  x: number;
  y: number;
}

/** Straight line to endpoint. */
export interface LineSeg {
  kind: 'line';
  x: number;
  y: number;
}

/** Cubic Bezier curve to endpoint via two control points. */
export interface CubicSeg {
  kind: 'cubic';
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
  x: number;
  y: number;
}

/** A segment is either a line or a cubic Bezier. */
export type PathSegment = LineSeg | CubicSeg;

/**
 * A closed path of segments. The implicit closing edge runs from the
 * last segment's endpoint back to `start`.
 */
export interface ShapePath {
  start: Point2D;
  segments: PathSegment[];
}

/** Create a line segment. */
export function lineTo(x: number, y: number): LineSeg {
  return { kind: 'line', x, y };
}

/** Create a cubic Bezier segment. */
export function cubicTo(
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  x: number, y: number,
): CubicSeg {
  return { kind: 'cubic', cp1x, cp1y, cp2x, cp2y, x, y };
}

/** Create a closed path from a start point and segments. */
export function closedPath(start: Point2D, segments: PathSegment[]): ShapePath {
  return { start, segments };
}

/** Get the endpoint of a segment. */
export function segEnd(seg: PathSegment): Point2D {
  return { x: seg.x, y: seg.y };
}
