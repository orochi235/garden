import type { Seedling, Tray } from '../model/nursery';
import { trayInteriorOffsetIn } from '../model/nursery';

export interface CellHit {
  row: number;
  col: number;
}

/**
 * Cell hit-test in **tray-local inches**. The tray's local origin is the
 * top-left of its outer bounds; the cell grid is inset by `trayInteriorOffsetIn`.
 *
 * To hit-test from world-space coordinates, subtract the tray's world origin
 * (see `trayWorldOrigin(tray, ss)` in `adapters/nurseryScene.ts`) before
 * calling this function — i.e. `hitTestCellInches(tray, worldX - o.x, worldY - o.y)`.
 *
 * This module is view-transform-free: no `zoom`/`panX`/`panY` references.
 * Conversion from screen→world happens at the gesture/view boundary.
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

/** Per-tray world origin used by `findSeedlingsInRect` to place cell centers
 *  in world space. Provided by callers (typically via
 *  `trayWorldOrigin(tray, ss)`) so this module stays free of seedStarting-state
 *  imports and keeps no view-transform dependency. */
export type TrayOriginFn = (tray: Tray) => { x: number; y: number };

export interface WorldRect { x: number; y: number; width: number; height: number }

/**
 * World-coord cell hit-test across every tray. Searches each tray's grid
 * (after subtracting its world origin via `getOrigin`) and returns the first
 * tray whose cell-grid contains the point. Returns `null` when the point
 * misses every tray (e.g. inter-tray gutter, far outside).
 *
 * Used by the seedling-move tool to support cross-tray drops: the dragged
 * seedling can be released into any tray's cell, not just its source tray.
 *
 * `getOrigin` is required (no single-tray fallback) — multi-tray hit-testing
 * only makes sense when callers know how to translate tray-local coords to
 * world space. Pass `(tray) => trayWorldOrigin(tray, ss)` from
 * `adapters/nurseryScene.ts`.
 */
export function hitTestCellAcrossTrays(
  trays: Tray[],
  worldX: number,
  worldY: number,
  getOrigin: TrayOriginFn,
): { trayId: string; row: number; col: number } | null {
  for (const tray of trays) {
    const o = getOrigin(tray);
    const cell = hitTestCellInches(tray, worldX - o.x, worldY - o.y);
    if (cell) return { trayId: tray.id, row: cell.row, col: cell.col };
  }
  return null;
}

/**
 * Returns the ids of all seedlings whose **world-space** cell centers fall
 * inside the given world-space rect. The rect may have negative width/height
 * (reversed drag); we normalize before comparison.
 *
 * If `getOrigin` is omitted, every tray's world origin is treated as `(0,0)`
 * — matching the legacy single-tray behavior. Multi-tray callers should pass
 * `(tray) => trayWorldOrigin(tray, ss)` so cell centers translate correctly.
 */
export function findSeedlingsInRect(
  trays: Tray[],
  seedlings: Seedling[],
  rect: WorldRect,
  getOrigin?: TrayOriginFn,
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
    const local = cellCenterInches(tray, s.row, s.col);
    const o = getOrigin ? getOrigin(tray) : { x: 0, y: 0 };
    const cx = o.x + local.x;
    const cy = o.y + local.y;
    if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) out.push(s.id);
  }
  return out;
}
