/**
 * Vendored pose-translation helper (pin copy).
 *
 * `useMove`'s default `translatePose`. Pin's `features/groups/composePose`
 * exported a family of compose/decompose helpers; the vendored move controller
 * only needs `translateRectPose`, so that's all that's copied here.
 */

/** Axis-aligned rectangle pose. */
export interface RectPose {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Translate a `RectPose`-shaped pose by `(dx, dy)`. Suitable as the default
 * `translatePose` for `useMove` when poses carry top-level `x`/`y`. Other
 * fields (width/height, plus any extra props on `TPose`) are preserved.
 */
export function translateRectPose<TPose extends RectPose>(
  pose: TPose,
  dx: number,
  dy: number,
): TPose {
  return { ...pose, x: pose.x + dx, y: pose.y + dy };
}
