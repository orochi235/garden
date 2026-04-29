import type { Tray } from '../../model/seedStarting';

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
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      out.push({
        row: r,
        col: c,
        xIn: c * p,
        yIn: r * p,
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

  if (showGrid) {
    // Cell grid (includes outline at c=0/c=cols and r=0/r=rows)
    const p = tray.cellPitchIn * pxPerInch;
    for (let c = 0; c <= tray.cols; c++) {
      const x = originX + c * p;
      ctx.beginPath();
      ctx.moveTo(x, originY);
      ctx.lineTo(x, originY + h);
      ctx.stroke();
    }
    for (let r = 0; r <= tray.rows; r++) {
      const y = originY + r * p;
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(originX + w, y);
      ctx.stroke();
    }
  } else {
    // Tray outline only
    ctx.strokeRect(originX, originY, w, h);
  }
}
