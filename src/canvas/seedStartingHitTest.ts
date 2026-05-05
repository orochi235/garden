import type { Seedling, Tray } from '../model/seedStarting';
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

export interface WorldRect { x: number; y: number; width: number; height: number }

/** Returns the ids of all seedlings whose cell center falls inside the given
 *  world-space rect. Tray world origin is treated as (0,0) (matching
 *  `seedStartingScene` adapter). */
export function findSeedlingsInRect(
  trays: Tray[],
  seedlings: Seedling[],
  rect: WorldRect,
): string[] {
  const x0 = Math.min(rect.x, rect.x + rect.width);
  const x1 = Math.max(rect.x, rect.x + rect.width);
  const y0 = Math.min(rect.y, rect.y + rect.height);
  const y1 = Math.max(rect.y, rect.y + rect.height);
  const out: string[] = [];
  const trayById = new Map(trays.map((t) => [t.id, t]));
  for (const s of seedlings) {
    if (!s.trayId || s.row == null || s.col == null) continue;
    const tray = trayById.get(s.trayId);
    if (!tray) continue;
    const c = cellCenterInches(tray, s.row, s.col);
    if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) out.push(s.id);
  }
  return out;
}
