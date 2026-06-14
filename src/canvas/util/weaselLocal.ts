import type { View } from '@orochi235/weasel';
import { polygonFromPoints } from '@orochi235/weasel';

/**
 * Local reimplementation of weasel's `viewToMat3`, kept for behavioral parity
 * (we deliberately do NOT swap to the kit's exported `viewToMat3`).
 * Column-major 3×3: maps world coords → screen pixels using the camera-position
 * View semantics (view.x/y is the world point at canvas origin).
 *
 * HEAD's `View.scale` is a per-axis `{ x, y }` vector. eric uses uniform zoom
 * (`scale.x === scale.y`), so the two axes are read independently here while
 * staying runtime-identical to the old scalar form.
 */
export function viewToMat3(view: View): Float32Array {
  const sx = view.scale.x;
  const sy = view.scale.y;
  // biome-ignore format: matrix layout
  return new Float32Array([sx, 0, 0, 0, sy, 0, -view.x * sx, -view.y * sy, 1]);
}

/**
 * `DrawCommand` and `TextureHandle` are now public exports of
 * `@orochi235/weasel` (they were private in the 0.2.0 pin, which is why this
 * module derived structural shims). Re-export them so layer files keep
 * importing both from one place, unchanged.
 */
export type { DrawCommand, PolygonPath, TextureHandle } from '@orochi235/weasel';

/**
 * Polygon approximation of a circle. Pre-flattened to N samples so it doesn't
 * suffer from weasel's `DEFAULT_FLATTEN_TOLERANCE = 0.5` (path-local units),
 * which collapses sub-foot bezier circles to 4-vertex diamonds when the path
 * is in world-feet coords.
 */
export function circlePolygon(
  cx: number,
  cy: number,
  r: number,
  samples = 32,
): ReturnType<typeof polygonFromPoints> {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  return polygonFromPoints(pts);
}

/** Same idea for ellipses. */
export function ellipsePolygon(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  samples = 32,
): ReturnType<typeof polygonFromPoints> {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
  }
  return polygonFromPoints(pts);
}

/**
 * Polygon approximation of a rounded rectangle. Each corner is approximated
 * by `cornerSamples` vertices on a quarter-circle arc.
 */
export function roundRectPolygon(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  cornerSamples = 8,
): ReturnType<typeof polygonFromPoints> {
  r = Math.min(r, w / 2, h / 2);
  const pts: { x: number; y: number }[] = [];
  // Each corner: quarter arc from start to end angles.
  // Order: TL → TR → BR → BL.
  const corners = [
    { cx: x + r, cy: y + r, a0: Math.PI, a1: 1.5 * Math.PI },
    { cx: x + w - r, cy: y + r, a0: 1.5 * Math.PI, a1: 2 * Math.PI },
    { cx: x + w - r, cy: y + h - r, a0: 0, a1: 0.5 * Math.PI },
    { cx: x + r, cy: y + h - r, a0: 0.5 * Math.PI, a1: Math.PI },
  ];
  for (const c of corners) {
    for (let i = 0; i <= cornerSamples; i++) {
      const t = c.a0 + ((c.a1 - c.a0) * i) / cornerSamples;
      pts.push({ x: c.cx + Math.cos(t) * r, y: c.cy + Math.sin(t) * r });
    }
  }
  return polygonFromPoints(pts);
}
