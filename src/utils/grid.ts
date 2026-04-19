export interface ViewTransform {
  panX: number;
  panY: number;
  zoom: number;
}

export function snapToGrid(value: number, cellSize: number): number {
  return Math.round(value / cellSize) * cellSize || 0;
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  view: ViewTransform,
): [number, number] {
  return [view.panX + worldX * view.zoom, view.panY + worldY * view.zoom];
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  view: ViewTransform,
): [number, number] {
  return [(screenX - view.panX) / view.zoom, (screenY - view.panY) / view.zoom];
}
