import {
  unionD,
  differenceD,
  intersectD,
  xorD,
  inflatePathsD,
  areaD,
  getBoundsD,
  pointInPolygonD,
  FillRule,
  JoinType,
  EndType,
  PointInPolygonResult,
  type PathD,
  type PathsD,
} from 'clipper2-ts';
import type { ShapePath, Point2D } from './types';
import { polygonPath } from './shapes';
import { flattenPath } from './flatten';

/** Default tessellation tolerance for Bezier flattening (in world units). */
const DEFAULT_TOLERANCE = 0.05;

/** Clipper2 precision — number of decimal places (2 = hundredths of a foot). */
const PRECISION = 4;

/** Convert a ShapePath to a Clipper2 PathD by flattening curves (preserves winding). */
function toPathDRaw(shape: ShapePath, tolerance = DEFAULT_TOLERANCE): PathD {
  return flattenPath(shape, tolerance).map(p => ({ x: p.x, y: p.y }));
}

/** Convert a ShapePath to a Clipper2 PathD, normalizing to clockwise winding
 *  (positive area in Clipper2 screen-space convention) for use as Clipper2 input. */
function toPathD(shape: ShapePath, tolerance = DEFAULT_TOLERANCE): PathD {
  const pts = toPathDRaw(shape, tolerance);
  // Ensure clockwise winding (positive areaD) for consistent Clipper2 behavior
  if (areaD(pts) < 0) pts.reverse();
  return pts;
}

/** Convert multiple ShapePaths to Clipper2 PathsD. */
function toPathsD(shapes: ShapePath[], tolerance = DEFAULT_TOLERANCE): PathsD {
  return shapes.map(s => toPathD(s, tolerance));
}

/** Convert Clipper2 PathsD result back to ShapePaths (polygon-only, no curves). */
function fromPathsD(paths: PathsD): ShapePath[] {
  return paths
    .filter(p => p.length >= 3)
    .map(p => polygonPath(p.map(pt => ({ x: pt.x, y: pt.y }))));
}

/** Union multiple shapes into one or more result shapes. */
export function shapeUnion(shapes: ShapePath[]): ShapePath[] {
  return fromPathsD(unionD(toPathsD(shapes), FillRule.NonZero, PRECISION));
}

/** Subtract clip shapes from a subject shape. */
export function shapeDifference(subject: ShapePath, clips: ShapePath[]): ShapePath[] {
  return fromPathsD(
    differenceD(toPathsD([subject]), toPathsD(clips), FillRule.NonZero, PRECISION),
  );
}

/** Intersect subject shapes with clip shapes. */
export function shapeIntersection(subjects: ShapePath[], clips: ShapePath[]): ShapePath[] {
  return fromPathsD(
    intersectD(toPathsD(subjects), toPathsD(clips), FillRule.NonZero, PRECISION),
  );
}

/** XOR subject shapes with clip shapes. */
export function shapeXor(subjects: ShapePath[], clips: ShapePath[]): ShapePath[] {
  return fromPathsD(
    xorD(toPathsD(subjects), toPathsD(clips), FillRule.NonZero, PRECISION),
  );
}

/**
 * Offset (inflate/deflate) a shape by a distance.
 * Positive delta expands, negative shrinks.
 * joinType controls corner treatment (default: miter for rects, round for curves).
 */
export function shapeOffset(
  shape: ShapePath,
  delta: number,
  joinType: JoinType = JoinType.Miter,
): ShapePath[] {
  return fromPathsD(
    inflatePathsD(
      toPathsD([shape]),
      delta,
      joinType,
      EndType.Polygon,
      2.0,
      PRECISION,
    ),
  );
}

/** Compute the signed area of a shape.
 *  Positive for outer paths (clockwise in screen space), negative for hole paths. */
export function shapeArea(shape: ShapePath): number {
  return areaD(toPathDRaw(shape));
}

/** Compute the axis-aligned bounding box of a shape. */
export function shapeBounds(shape: ShapePath): { x: number; y: number; width: number; height: number } {
  const b = getBoundsD(toPathDRaw(shape));
  return {
    x: b.left,
    y: b.top,
    width: b.right - b.left,
    height: b.bottom - b.top,
  };
}

/** Test if a point is inside a shape. */
export function pointInShape(px: number, py: number, shape: ShapePath): boolean {
  const result = pointInPolygonD({ x: px, y: py }, toPathD(shape), PRECISION);
  return result !== PointInPolygonResult.IsOutside;
}
