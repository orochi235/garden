/**
 * Compute the union AABB of a set of rectangle-shaped poses.
 *
 * Returns null when the input is empty. Useful for selection overlay
 * rendering of groups (where the displayed bounds are the envelope of
 * all transitive leaf members).
 */

export interface RectPose {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function unionBounds<TPose extends RectPose>(poses: Iterable<TPose>): RectPose | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const p of poses) {
    any = true;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    const right = p.x + p.width;
    const bottom = p.y + p.height;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  if (!any) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
