import type { NurseryState, Tray } from '../../model/nursery';

/**
 * Pure auto-flow layout math for the nursery world. Extracted from
 * `adapters/nurseryScene.ts` so the scene converter (`scene/nurseryScene.ts`)
 * can derive tray world poses WITHOUT importing the adapter (which pulls in the
 * garden store and would create an import cycle: gardenStore → nurseryScene →
 * adapter → gardenStore). This module depends only on the nursery model.
 */

/** Gap between trays (both axes) in the auto-flow nursery world layout. */
export const TRAY_GUTTER_IN = 2;
/** Number of trays per column before wrapping to a new column. */
export const TRAYS_PER_COLUMN = 3;

/**
 * Column-major layout: trays fill the first column top-to-bottom up to
 * `TRAYS_PER_COLUMN`, then wrap to a new column. Each column's width is the
 * max width of its members. Single-tray gardens get `(0, 0)`.
 */
export function trayWorldOrigin(tray: Tray, ss: NurseryState): { x: number; y: number } {
  const idx = ss.trays.findIndex((t) => t.id === tray.id);
  if (idx < 0) return { x: 0, y: 0 };
  const col = Math.floor(idx / TRAYS_PER_COLUMN);
  const row = idx % TRAYS_PER_COLUMN;

  let x = 0;
  for (let c = 0; c < col; c++) {
    let colWidth = 0;
    for (let r = 0; r < TRAYS_PER_COLUMN; r++) {
      const t = ss.trays[c * TRAYS_PER_COLUMN + r];
      if (t && t.widthIn > colWidth) colWidth = t.widthIn;
    }
    x += colWidth + TRAY_GUTTER_IN;
  }
  let y = 0;
  for (let r = 0; r < row; r++) {
    const t = ss.trays[col * TRAYS_PER_COLUMN + r];
    if (t) y += t.heightIn + TRAY_GUTTER_IN;
  }
  return { x, y };
}

/** Total bounds spanned by all trays under the column-major auto-flow. */
export function nurseryWorldBounds(ss: NurseryState): { width: number; height: number } {
  if (ss.trays.length === 0) return { width: 0, height: 0 };
  const cols = Math.ceil(ss.trays.length / TRAYS_PER_COLUMN);
  let width = 0;
  let height = 0;
  for (let c = 0; c < cols; c++) {
    let colWidth = 0;
    let colHeight = 0;
    let rowsInCol = 0;
    for (let r = 0; r < TRAYS_PER_COLUMN; r++) {
      const t = ss.trays[c * TRAYS_PER_COLUMN + r];
      if (!t) break;
      if (t.widthIn > colWidth) colWidth = t.widthIn;
      colHeight += t.heightIn;
      rowsInCol += 1;
    }
    if (rowsInCol > 1) colHeight += (rowsInCol - 1) * TRAY_GUTTER_IN;
    width += colWidth;
    if (c < cols - 1) width += TRAY_GUTTER_IN;
    if (colHeight > height) height = colHeight;
  }
  return { width, height };
}
