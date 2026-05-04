import type { Tray } from '../model/seedStarting';
import { trayInteriorOffsetIn } from '../model/seedStarting';

export interface CellHit {
  row: number;
  col: number;
}

/**
 * Cell hit-test in tray-local inches. The tray's local origin is the
 * top-left of its outer bounds; the cell grid is inset by `trayInteriorOffsetIn`.
 */
export function hitTestCellInches(tray: Tray, xIn: number, yIn: number): CellHit | null {
  const off = trayInteriorOffsetIn(tray);
  const localX = xIn - off.x;
  const localY = yIn - off.y;
  if (localX < 0 || localY < 0) return null;
  const totalW = tray.cols * tray.cellPitchIn;
  const totalH = tray.rows * tray.cellPitchIn;
  if (localX >= totalW || localY >= totalH) return null;
  return { row: Math.floor(localY / tray.cellPitchIn), col: Math.floor(localX / tray.cellPitchIn) };
}

/** Tray-local inch coordinates of the center of cell (row, col). */
export function cellCenterInches(tray: Tray, row: number, col: number): { x: number; y: number } {
  const off = trayInteriorOffsetIn(tray);
  return {
    x: off.x + (col + 0.5) * tray.cellPitchIn,
    y: off.y + (row + 0.5) * tray.cellPitchIn,
  };
}

export type DragSpreadAffordanceHit =
  | { kind: 'all' }
  | { kind: 'row'; row: number }
  | { kind: 'col'; col: number };

/** Affordance gutter size in inches (relative to cell pitch). */
export const DRAG_SPREAD_GUTTER_RATIO = 0.7;

/** World-space (inches) variant. Tray world origin is `(0,0)` so the grid
 *  sits at `(off.x, off.y)` inches; the cursor is given in tray-local inches. */
export function hitTestDragSpreadAffordanceInches(
  tray: Tray,
  xIn: number,
  yIn: number,
): DragSpreadAffordanceHit | null {
  const off = trayInteriorOffsetIn(tray);
  const p = tray.cellPitchIn;
  const gutter = p * DRAG_SPREAD_GUTTER_RATIO;
  const lx = xIn - off.x;
  const ly = yIn - off.y;
  const inGutterX = lx >= -gutter && lx < 0;
  const inGutterY = ly >= -gutter && ly < 0;
  const totalW = tray.cols * p;
  const totalH = tray.rows * p;

  if (inGutterX && inGutterY) return { kind: 'all' };
  if (inGutterY && lx >= 0 && lx < totalW) return { kind: 'col', col: Math.floor(lx / p) };
  if (inGutterX && ly >= 0 && ly < totalH) return { kind: 'row', row: Math.floor(ly / p) };
  return null;
}
