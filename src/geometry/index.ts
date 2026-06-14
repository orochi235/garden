export type { PathSink } from './canvas';
export { tracePolyline, traceShapePath } from './canvas';
export { structureToShape, zoneToShape } from './convert';
export { flattenPath } from './flatten';
export {
  isHole,
  minkowskiSum,
  pointInShape,
  shapeArea,
  shapeBounds,
  shapeDifference,
  shapeIntersection,
  shapeOffset,
  shapeUnion,
  shapeXor,
  triangulate,
} from './ops';
export { ellipsePath, polygonPath, rectPath } from './shapes';
export type { CubicSeg, LineSeg, PathSegment, Point2D, ShapePath } from './types';
export { closedPath, cubicTo, lineTo, segEnd } from './types';
