export type { Point2D, LineSeg, CubicSeg, PathSegment, ShapePath } from './types';
export { lineTo, cubicTo, closedPath, segEnd } from './types';
export { flattenPath } from './flatten';
export { rectPath, ellipsePath, polygonPath } from './shapes';
export {
  shapeUnion,
  shapeDifference,
  shapeIntersection,
  shapeXor,
  shapeOffset,
  shapeArea,
  shapeBounds,
  pointInShape,
} from './ops';
export type { PathSink } from './canvas';
export { traceShapePath, tracePolyline } from './canvas';
export { structureToShape, zoneToShape } from './convert';
