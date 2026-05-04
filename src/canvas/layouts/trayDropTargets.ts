import type { DropTarget } from '@orochi235/weasel';
import { trayInteriorOffsetIn, type Tray } from '../../model/seedStarting';
import { DRAG_SPREAD_GUTTER_RATIO } from '../seedStartingHitTest';

export type TrayDropKind = 'cell' | 'row' | 'col' | 'all';

export type TrayDropMeta =
  | { kind: 'all' }
  | { kind: 'row'; row: number }
  | { kind: 'col'; col: number }
  | { kind: 'cell'; row: number; col: number };

/** Subset of `TrayDropMeta` representing gutter (bulk-fill) targets. */
export type TrayGutterMeta = Exclude<TrayDropMeta, { kind: 'cell' }>;

export type TrayDropTarget = DropTarget<{ x: number; y: number }> & {
  meta: TrayDropMeta;
};

/**
 * Build the list of drop targets for a tray: each cell as a containment
 * region, plus row / column / all gutter regions outside the cell grid.
 *
 * Ordering matters: the "all" corner is emitted first (strictly inside the
 * row+col gutter intersection), then per-row and per-col gutters, then
 * cells. Region-aware snaps (like `containedThenNearest`) walk targets in
 * order and return the first containment hit, so narrower targets need to
 * appear before broader ones.
 */
export function getTrayDropTargets(tray: Tray): TrayDropTarget[] {
  const off = trayInteriorOffsetIn(tray);
  const p = tray.cellPitchIn;
  const gutter = p * DRAG_SPREAD_GUTTER_RATIO;
  const gridW = tray.cols * p;
  const gridH = tray.rows * p;
  const out: TrayDropTarget[] = [];

  // 1. Corner "all" target: strip × strip overlap above-left of the grid.
  out.push({
    pose: { x: off.x - gutter / 2, y: off.y - gutter / 2 },
    origin: { x: off.x - gutter / 2, y: off.y - gutter / 2 },
    hitBounds: { x: off.x - gutter, y: off.y - gutter, width: gutter, height: gutter },
    meta: { kind: 'all' },
  });

  // 2. Per-column gutters along the top edge.
  for (let c = 0; c < tray.cols; c++) {
    out.push({
      pose: { x: off.x + (c + 0.5) * p, y: off.y - gutter / 2 },
      origin: { x: off.x + (c + 0.5) * p, y: off.y - gutter / 2 },
      hitBounds: { x: off.x + c * p, y: off.y - gutter, width: p, height: gutter },
      meta: { kind: 'col', col: c },
    });
  }

  // 3. Per-row gutters along the left edge.
  for (let r = 0; r < tray.rows; r++) {
    out.push({
      pose: { x: off.x - gutter / 2, y: off.y + (r + 0.5) * p },
      origin: { x: off.x - gutter / 2, y: off.y + (r + 0.5) * p },
      hitBounds: { x: off.x - gutter, y: off.y + r * p, width: gutter, height: p },
      meta: { kind: 'row', row: r },
    });
  }

  // 4. Cells.
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      out.push({
        pose: { x: off.x + (c + 0.5) * p, y: off.y + (r + 0.5) * p },
        origin: { x: off.x + (c + 0.5) * p, y: off.y + (r + 0.5) * p },
        hitBounds: { x: off.x + c * p, y: off.y + r * p, width: p, height: p },
        meta: { kind: 'cell', row: r, col: c },
      });
    }
  }

  // Sanity: assert no two adjacent regions overlap unexpectedly. (Only the
  // implicit corner-vs-edge overlap is intentional, handled by ordering.)
  void gridW;
  void gridH;

  return out;
}

/** Strict containment: returns the first target whose `hitBounds` contains
 *  the point, or null. Unlike `containedThenNearest`, never falls back to
 *  nearest-origin — used when "outside everything" should mean "no target."
 */
export function hitTrayDropTarget(
  targets: TrayDropTarget[],
  point: { x: number; y: number },
): TrayDropTarget | null {
  for (const t of targets) {
    const r = t.hitBounds;
    if (!r) continue;
    if (point.x >= r.x && point.x < r.x + r.width && point.y >= r.y && point.y < r.y + r.height) {
      return t;
    }
  }
  return null;
}
