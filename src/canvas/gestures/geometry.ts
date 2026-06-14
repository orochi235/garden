/**
 * Vendored resize/rotate geometry helpers (pin copy).
 *
 * Used internally by the vendored `useResize` controller. The kit's public
 * `cornerResizeHandles`/`hitCornerHandle` (imported from `@orochi235/weasel`
 * by eric's tools for hit-testing) are byte-identical to these; this local
 * copy exists so the vendored controller doesn't depend on which of those
 * the kit happens to export.
 */
import type { ResizeAnchor, ResizePose } from './types';

// ----- rotate geometry -----

/** Rotate `(px, py)` by `angle` (radians) around `(cx, cy)`. */
export function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angle: number,
): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

// ----- corner handles -----

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Corner resize-handle: world-space center plus the anchor that pins the opposite corner. */
export interface CornerHandle {
  cx: number;
  cy: number;
  anchor: ResizeAnchor;
}

/** Standard 4-corner resize-handle layout. */
export function cornerResizeHandles(bounds: Bounds): CornerHandle[] {
  const { x, y, width, height } = bounds;
  return [
    { cx: x, cy: y, anchor: { x: 'max', y: 'max' } },
    { cx: x + width, cy: y, anchor: { x: 'min', y: 'max' } },
    { cx: x, cy: y + height, anchor: { x: 'max', y: 'min' } },
    { cx: x + width, cy: y + height, anchor: { x: 'min', y: 'min' } },
  ];
}

/** The corner that does NOT move under a resize gesture with the given anchor. */
export function fixedCornerOf(bounds: Bounds, anchor: ResizeAnchor): { x: number; y: number } {
  return {
    x: anchor.x === 'max' ? bounds.x + bounds.width : bounds.x,
    y: anchor.y === 'max' ? bounds.y + bounds.height : bounds.y,
  };
}

// ----- pose descriptor (bounds <-> TPose projection) -----

/**
 * Bridges arbitrary `TPose` shapes into the resize hook's bounds-driven math.
 */
export interface PoseDescriptor<TPose> {
  getBounds(pose: TPose): ResizePose;
  remapBounds(pose: TPose, src: ResizePose, dst: ResizePose): TPose;
  translate?(pose: TPose, dx: number, dy: number): TPose;
  getRotation?(pose: TPose): number;
}

/** Identity geometry for `TPose extends ResizePose`. */
export const RECT_POSE_DESCRIPTOR: PoseDescriptor<ResizePose> = {
  getBounds: (p) => p,
  remapBounds: (p, src, dst) => {
    const sx = src.width === 0 ? 1 : dst.width / src.width;
    const sy = src.height === 0 ? 1 : dst.height / src.height;
    return {
      ...p,
      x: dst.x + (p.x - src.x) * sx,
      y: dst.y + (p.y - src.y) * sy,
      width: p.width * sx,
      height: p.height * sy,
    };
  },
  translate: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
};
