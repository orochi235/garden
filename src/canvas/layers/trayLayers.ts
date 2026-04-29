import type { Tray } from '../../model/seedStarting';
import { trayInteriorOffsetIn } from '../../model/seedStarting';

export interface CellRect {
  row: number;
  col: number;
  /** Inch-space rect (origin at tray top-left). */
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

export function computeCellRectsIn(tray: Tray): CellRect[] {
  const out: CellRect[] = [];
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      out.push({
        row: r,
        col: c,
        xIn: off.x + c * p,
        yIn: off.y + r * p,
        widthIn: p,
        heightIn: p,
      });
    }
  }
  return out;
}

/** Render the tray outline + cell grid. ctx is in screen pixels; pass pxPerInch. */
export function renderTrayBase(
  ctx: CanvasRenderingContext2D,
  tray: Tray,
  pxPerInch: number,
  originX: number,
  originY: number,
  options: { showGrid?: boolean } = {},
) {
  const { showGrid = true } = options;
  const w = tray.widthIn * pxPerInch;
  const h = tray.heightIn * pxPerInch;

  // Tray body
  ctx.fillStyle = '#3a2e22';
  ctx.fillRect(originX, originY, w, h);

  ctx.strokeStyle = '#1a1410';
  ctx.lineWidth = 1;

  // Always draw the outer tray rim
  ctx.strokeRect(originX, originY, w, h);

  if (showGrid) {
    // Snap points: small dots at each cell center (matches drag-lab snap-point style)
    const p = tray.cellPitchIn * pxPerInch;
    const off = trayInteriorOffsetIn(tray);
    const ox = originX + off.x * pxPerInch;
    const oy = originY + off.y * pxPerInch;
    const dotRadius = Math.max(1.5, p * 0.06);
    ctx.fillStyle = 'rgba(91,164,207,0.5)';
    for (let r = 0; r < tray.rows; r++) {
      for (let c = 0; c < tray.cols; c++) {
        const cx = ox + c * p + p / 2;
        const cy = oy + r * p + p / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
