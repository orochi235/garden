import type { RenderLayer, View } from '@orochi235/weasel';

/**
 * Local replacement for weasel's internal `viewToMat3` (not in 0.2.0 public API).
 * Column-major 3×3: maps world coords → screen pixels using the camera-position
 * View semantics (view.x/y is the world point at canvas origin).
 */
export function viewToMat3(view: View): Float32Array {
  const s = view.scale;
  return new Float32Array([
    s, 0, 0,
    0, s, 0,
    -view.x * s, -view.y * s, 1,
  ]);
}

/**
 * `DrawCommand` is declared in weasel's .d.ts but not in the public export block
 * (0.2.0 oversight). Derive it structurally from `RenderLayer.draw`'s return type
 * so layer files can import it from one place.
 */
export type DrawCommand = ReturnType<RenderLayer<unknown>['draw']>[number];

/**
 * `TextureHandle` is also declared but not exported. Derive it from the pattern
 * factory return shape.
 */
import { createTilePattern, polygonFromPoints } from '@orochi235/weasel';
export type { PolygonPath } from '@orochi235/weasel';
export type TextureHandle = NonNullable<ReturnType<typeof createTilePattern>>;

/**
 * Polygon approximation of a circle. Pre-flattened to N samples so it doesn't
 * suffer from weasel's `DEFAULT_FLATTEN_TOLERANCE = 0.5` (path-local units),
 * which collapses sub-foot bezier circles to 4-vertex diamonds when the path
 * is in world-feet coords.
 */
export function circlePolygon(cx: number, cy: number, r: number, samples = 32): ReturnType<typeof polygonFromPoints> {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  return polygonFromPoints(pts);
}

/** Same idea for ellipses. */
export function ellipsePolygon(cx: number, cy: number, rx: number, ry: number, samples = 32): ReturnType<typeof polygonFromPoints> {
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
  x: number, y: number, w: number, h: number, r: number, cornerSamples = 8,
): ReturnType<typeof polygonFromPoints> {
  r = Math.min(r, w / 2, h / 2);
  const pts: { x: number; y: number }[] = [];
  // Each corner: quarter arc from start to end angles.
  // Order: TL → TR → BR → BL.
  const corners = [
    { cx: x + r,         cy: y + r,         a0: Math.PI,         a1: 1.5 * Math.PI },
    { cx: x + w - r,     cy: y + r,         a0: 1.5 * Math.PI,   a1: 2 * Math.PI },
    { cx: x + w - r,     cy: y + h - r,     a0: 0,               a1: 0.5 * Math.PI },
    { cx: x + r,         cy: y + h - r,     a0: 0.5 * Math.PI,   a1: Math.PI },
  ];
  for (const c of corners) {
    for (let i = 0; i <= cornerSamples; i++) {
      const t = c.a0 + ((c.a1 - c.a0) * i) / cornerSamples;
      pts.push({ x: c.cx + Math.cos(t) * r, y: c.cy + Math.sin(t) * r });
    }
  }
  return polygonFromPoints(pts);
}
