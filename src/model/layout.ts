export interface ParentBounds {
  x: number;
  y: number;
  width: number;
  length: number;
  shape: 'rectangle' | 'circle';
}

export type Layout =
  | { type: 'single' }
  | { type: 'grid'; cellSizeFt: number }
  | { type: 'snap-points'; points: { x: number; y: number }[] };

export type LayoutType = Layout['type'];

/**
 * Returns slot positions (world space) for single and snap-points modes.
 * Grid mode is handled by the canvas adapter (weasel grid snap).
 */
export function getSlots(
  layout: Layout,
  bounds: ParentBounds,
): { x: number; y: number }[] {
  switch (layout.type) {
    case 'single':
      return [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.length / 2 }];
    case 'snap-points':
      return layout.points.map((p) => ({ x: bounds.x + p.x, y: bounds.y + p.y }));
    case 'grid':
      return getGridCells(layout.cellSizeFt, bounds);
  }
}

/** Cell centers tiling the bounds at cellSizeFt pitch. */
export function getGridCells(
  cellSizeFt: number,
  bounds: ParentBounds,
): { x: number; y: number }[] {
  if (cellSizeFt <= 0) return [];
  const cols = Math.floor(bounds.width / cellSizeFt);
  const rows = Math.floor(bounds.length / cellSizeFt);
  const offsetX = (bounds.width - cols * cellSizeFt) / 2;
  const offsetY = (bounds.length - rows * cellSizeFt) / 2;
  const pts: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push({
        x: bounds.x + offsetX + c * cellSizeFt + cellSizeFt / 2,
        y: bounds.y + offsetY + r * cellSizeFt + cellSizeFt / 2,
      });
    }
  }
  return pts;
}
