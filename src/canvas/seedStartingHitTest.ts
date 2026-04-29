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
