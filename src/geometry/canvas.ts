import type { Point2D, ShapePath } from './types';

/**
 * Minimal interface for path-tracing commands.
 * Satisfied by CanvasRenderingContext2D and Path2D.
 */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  closePath(): void;
}

/**
 * Trace a ShapePath onto a PathSink (ctx or Path2D).
 * Uses native bezierCurveTo for cubic segments — no tessellation needed for rendering.
 */
export function traceShapePath(sink: PathSink, shape: ShapePath): void {
  sink.moveTo(shape.start.x, shape.start.y);
  for (const seg of shape.segments) {
    if (seg.kind === 'line') {
      sink.lineTo(seg.x, seg.y);
    } else {
      sink.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y);
    }
  }
  sink.closePath();
}

/**
 * Trace a polyline (e.g. from Clipper2 results) onto a PathSink as a closed polygon.
 */
export function tracePolyline(sink: PathSink, points: Point2D[]): void {
  if (points.length === 0) return;
  sink.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    sink.lineTo(points[i].x, points[i].y);
  }
  sink.closePath();
}
