import type { Tray } from '../model/seedStarting';
import { trayInteriorOffsetIn } from '../model/seedStarting';

export interface SeedStartingViewport {
  pxPerInch: number;
  originX: number;
  originY: number;
}

export interface CellHit {
  row: number;
  col: number;
}

export function hitTestCell(
  tray: Tray,
  viewport: SeedStartingViewport,
  screenX: number,
  screenY: number,
): CellHit | null {
  const off = trayInteriorOffsetIn(tray);
  const localX = screenX - viewport.originX - off.x * viewport.pxPerInch;
  const localY = screenY - viewport.originY - off.y * viewport.pxPerInch;
  if (localX < 0 || localY < 0) return null;
  const totalW = tray.cols * tray.cellPitchIn * viewport.pxPerInch;
  const totalH = tray.rows * tray.cellPitchIn * viewport.pxPerInch;
  if (localX >= totalW || localY >= totalH) return null;
  const cellPx = tray.cellPitchIn * viewport.pxPerInch;
  return { row: Math.floor(localY / cellPx), col: Math.floor(localX / cellPx) };
}

export type DragSpreadAffordanceHit =
  | { kind: 'all' }
  | { kind: 'row'; row: number }
  | { kind: 'col'; col: number };

/** Affordance gutter size in inches (relative to cell pitch). */
export const DRAG_SPREAD_GUTTER_RATIO = 0.7;

/** Hit-test the row/column/all affordance markers along the top and left edges. */
export function hitTestDragSpreadAffordance(
  tray: Tray,
  viewport: SeedStartingViewport,
  screenX: number,
  screenY: number,
): DragSpreadAffordanceHit | null {
  const off = trayInteriorOffsetIn(tray);
  const ppi = viewport.pxPerInch;
  const cellPx = tray.cellPitchIn * ppi;
  const gutter = cellPx * DRAG_SPREAD_GUTTER_RATIO;
  // Affordance origin = grid origin minus gutter on each axis.
  const gridX = viewport.originX + off.x * ppi;
  const gridY = viewport.originY + off.y * ppi;
  const lx = screenX - gridX;
  const ly = screenY - gridY;
  const inGutterX = lx >= -gutter && lx < 0;
  const inGutterY = ly >= -gutter && ly < 0;
  const totalW = tray.cols * cellPx;
  const totalH = tray.rows * cellPx;

  if (inGutterX && inGutterY) return { kind: 'all' };
  if (inGutterY && lx >= 0 && lx < totalW) return { kind: 'col', col: Math.floor(lx / cellPx) };
  if (inGutterX && ly >= 0 && ly < totalH) return { kind: 'row', row: Math.floor(ly / cellPx) };
  return null;
}
