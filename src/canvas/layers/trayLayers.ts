import type { Tray } from '../../model/seedStarting';
import { trayInteriorOffsetIn } from '../../model/seedStarting';
import { DRAG_SPREAD_GUTTER_RATIO } from '../seedStartingHitTest';

export type DragSpreadAffordanceHover =
  | { kind: 'all' }
  | { kind: 'row'; row: number }
  | { kind: 'col'; col: number }
  | null;

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
  options: { showGrid?: boolean; showDragSpreadAffordances?: boolean; dragSpreadAffordanceHover?: DragSpreadAffordanceHover } = {},
) {
  const { showGrid = true, showDragSpreadAffordances = false, dragSpreadAffordanceHover = null } = options;
  const w = tray.widthIn * pxPerInch;
  const h = tray.heightIn * pxPerInch;

  // Tray body
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(originX, originY, w, h);

  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;

  // Always draw the outer tray rim
  ctx.strokeRect(originX, originY, w, h);

  {
    const p = tray.cellPitchIn * pxPerInch;
    const off = trayInteriorOffsetIn(tray);
    const ox = originX + off.x * pxPerInch;
    const oy = originY + off.y * pxPerInch;
    const wellRadius = p * 0.4;
    const dotRadius = Math.max(1.5, p * 0.06);

    // Well rings: subtle rim showing the physical well opening
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    for (let r = 0; r < tray.rows; r++) {
      for (let c = 0; c < tray.cols; c++) {
        const cx = ox + c * p + p / 2;
        const cy = oy + r * p + p / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, wellRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (showGrid) {
      // Snap points: small dots at each cell center (drag-lab style)
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

    if (showDragSpreadAffordances) {
      drawDragSpreadAffordances(ctx, tray, p, ox, oy, dragSpreadAffordanceHover);
    }
  }
}

function drawDragSpreadAffordances(
  ctx: CanvasRenderingContext2D,
  tray: Tray,
  p: number,
  ox: number,
  oy: number,
  hover: DragSpreadAffordanceHover,
) {
  const gutter = p * DRAG_SPREAD_GUTTER_RATIO;
  const markerLen = Math.min(gutter * 0.8, p * 0.55);
  const markerW = Math.max(2, p * 0.18);
  const baseFill = '#d4a55a';
  const baseStroke = '#1a1a1a';
  const hoverFill = '#ffd27a';

  // Per-column markers along the top edge.
  for (let c = 0; c < tray.cols; c++) {
    const cx = ox + c * p + p / 2;
    const cy = oy - gutter / 2;
    const isHover = hover?.kind === 'col' && hover.col === c;
    drawPlantingMarker(ctx, cx, cy, markerLen, markerW, 'down', isHover ? hoverFill : baseFill, baseStroke);
  }

  // Per-row markers along the left edge.
  for (let r = 0; r < tray.rows; r++) {
    const cx = ox - gutter / 2;
    const cy = oy + r * p + p / 2;
    const isHover = hover?.kind === 'row' && hover.row === r;
    drawPlantingMarker(ctx, cx, cy, markerLen, markerW, 'right', isHover ? hoverFill : baseFill, baseStroke);
  }

  // Diagonal corner marker (fills the entire grid). Larger than row/col markers.
  {
    const cx = ox - gutter / 2;
    const cy = oy - gutter / 2;
    const isHover = hover?.kind === 'all';
    drawPlantingMarker(
      ctx,
      cx,
      cy,
      markerLen * 1.45,
      markerW * 1.35,
      'down-right',
      isHover ? hoverFill : baseFill,
      baseStroke,
    );
  }
}

/**
 * Draws a small planting-marker icon: a stake (rectangle) topped with a tag (rounded rect),
 * pointing in the given direction. (cx, cy) is the marker's center.
 */
function drawPlantingMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  length: number,
  width: number,
  dir: 'down' | 'right' | 'down-right',
  fill: string,
  stroke: string,
) {
  ctx.save();
  ctx.translate(cx, cy);
  // Rotate so "down" is the canonical orientation: tag at top, stake pointing downward.
  if (dir === 'right') ctx.rotate(-Math.PI / 2);
  else if (dir === 'down-right') ctx.rotate(-Math.PI / 4);

  const tagH = length * 0.6;
  const tagW = width * 2.6;
  const r = Math.min(2, tagH / 2, tagW / 2);

  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;

  const tagTop = -length / 2;
  const tagBottom = tagTop + tagH;
  const stakeBottom = length / 2;
  const stakeShoulder = stakeBottom - width / 2;

  // Single combined silhouette: rounded tag on top, stake with pointed bottom below.
  ctx.beginPath();
  ctx.moveTo(-tagW / 2 + r, tagTop);
  ctx.lineTo(tagW / 2 - r, tagTop);
  ctx.arcTo(tagW / 2, tagTop, tagW / 2, tagTop + r, r);
  ctx.lineTo(tagW / 2, tagBottom - r);
  ctx.arcTo(tagW / 2, tagBottom, tagW / 2 - r, tagBottom, r);
  ctx.lineTo(width / 2, tagBottom);
  ctx.lineTo(width / 2, stakeShoulder);
  ctx.lineTo(0, stakeBottom);
  ctx.lineTo(-width / 2, stakeShoulder);
  ctx.lineTo(-width / 2, tagBottom);
  ctx.lineTo(-tagW / 2 + r, tagBottom);
  ctx.arcTo(-tagW / 2, tagBottom, -tagW / 2, tagBottom - r, r);
  ctx.lineTo(-tagW / 2, tagTop + r);
  ctx.arcTo(-tagW / 2, tagTop, -tagW / 2 + r, tagTop, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}
