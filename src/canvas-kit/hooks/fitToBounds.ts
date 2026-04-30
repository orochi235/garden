/**
 * Compute the largest uniform zoom (px per content-unit) that fits a content
 * rect of `contentW x contentH` (in content units) into a viewport rect of
 * `availW x availH` (in pixels).
 *
 * `clamp` optionally bounds the resulting zoom to [min, max].
 */
export function fitZoom(
  availW: number,
  availH: number,
  contentW: number,
  contentH: number,
  clamp?: { min?: number; max?: number },
): number {
  const raw = Math.min(availW / contentW, availH / contentH);
  const min = clamp?.min ?? -Infinity;
  const max = clamp?.max ?? Infinity;
  return Math.min(max, Math.max(min, raw));
}

/**
 * Compute zoom + pan that centers `contentW x contentH` (content units) inside
 * a `viewportW x viewportH` (pixel) rect. `paddingPx` is uniform pixel padding
 * on every side.
 */
export function fitToBounds(
  viewportW: number,
  viewportH: number,
  contentW: number,
  contentH: number,
  paddingPx = 0,
  clamp?: { min?: number; max?: number },
): { zoom: number; panX: number; panY: number } {
  const availW = Math.max(1, viewportW - paddingPx * 2);
  const availH = Math.max(1, viewportH - paddingPx * 2);
  const zoom = fitZoom(availW, availH, contentW, contentH, clamp);
  const contentPxW = contentW * zoom;
  const contentPxH = contentH * zoom;
  return {
    zoom,
    panX: (viewportW - contentPxW) / 2,
    panY: (viewportH - contentPxH) / 2,
  };
}
