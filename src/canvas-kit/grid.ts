/** Pan offset (in pixels) plus uniform zoom (pixels per content unit). */
export interface ViewTransform {
  panX: number;
  panY: number;
  zoom: number;
}

/** Round `value` to the nearest multiple of `cellSize`. Returns 0 when the result would be -0. */
export function roundToCell(value: number, cellSize: number): number {
  return Math.round(value / cellSize) * cellSize || 0;
}

/** Project a world-space point to screen-space pixels through a `ViewTransform`. */
export function worldToScreen(
  worldX: number,
  worldY: number,
  view: ViewTransform,
): [number, number] {
  return [view.panX + worldX * view.zoom, view.panY + worldY * view.zoom];
}

/** Inverse of `worldToScreen` — recover the world-space point under a screen-space pixel. */
export function screenToWorld(
  screenX: number,
  screenY: number,
  view: ViewTransform,
): [number, number] {
  return [(screenX - view.panX) / view.zoom, (screenY - view.panY) / view.zoom];
}
