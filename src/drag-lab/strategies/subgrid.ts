// src/drag-lab/strategies/subgrid.ts
import type { LayoutStrategy, Rect, Point, ConfigField, DragFeedback, DropResult } from '../types';

interface CellCoord { col: number; row: number; }

function getGridDims(config: Record<string, unknown>) {
  const cols = (config.cols as number) ?? 4;
  const rows = (config.rows as number) ?? 4;
  const gapFt = (config.gapFt as number) ?? 0.05;
  return { cols, rows, gapFt };
}

function cellCenter(bounds: Rect, cols: number, rows: number, gapFt: number, col: number, row: number): Point {
  const totalGapX = gapFt * (cols - 1);
  const totalGapY = gapFt * (rows - 1);
  const cellW = (bounds.width - totalGapX) / cols;
  const cellH = (bounds.height - totalGapY) / rows;
  return {
    x: bounds.x + col * (cellW + gapFt) + cellW / 2,
    y: bounds.y + row * (cellH + gapFt) + cellH / 2,
  };
}

function posToCell(bounds: Rect, cols: number, rows: number, gapFt: number, pos: Point): CellCoord {
  const totalGapX = gapFt * (cols - 1);
  const totalGapY = gapFt * (rows - 1);
  const cellW = (bounds.width - totalGapX) / cols;
  const cellH = (bounds.height - totalGapY) / rows;
  const col = Math.floor((pos.x - bounds.x) / (cellW + gapFt));
  const row = Math.floor((pos.y - bounds.y) / (cellH + gapFt));
  return { col: Math.max(0, Math.min(cols - 1, col)), row: Math.max(0, Math.min(rows - 1, row)) };
}

function cellRect(bounds: Rect, cols: number, rows: number, gapFt: number, col: number, row: number): Rect {
  const totalGapX = gapFt * (cols - 1);
  const totalGapY = gapFt * (rows - 1);
  const cellW = (bounds.width - totalGapX) / cols;
  const cellH = (bounds.height - totalGapY) / rows;
  return {
    x: bounds.x + col * (cellW + gapFt),
    y: bounds.y + row * (cellH + gapFt),
    width: cellW,
    height: cellH,
  };
}

export const subgridStrategy: LayoutStrategy = {
  name: 'Tile grid',

  render(ctx, bounds, _shape, items, config) {
    const { cols, rows, gapFt } = getGridDims(config);
    const overlay = !!config.overlayGuides;

    const occupiedCells = new Set<string>();
    for (const item of items) {
      const { col, row } = posToCell(bounds, cols, rows, gapFt, item);
      occupiedCells.add(`${col},${row}`);
    }

    const renderGrid = () => {
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const cell = cellRect(bounds, cols, rows, gapFt, c, r);
          ctx.strokeStyle = 'rgba(127,176,105,0.3)';
          ctx.lineWidth = 0.02;
          ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);

          if (occupiedCells.has(`${c},${r}`)) {
            // Hatch occupied cells
            ctx.save();
            ctx.beginPath();
            ctx.rect(cell.x, cell.y, cell.width, cell.height);
            ctx.clip();
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 0.02;
            const step = 0.1;
            const total = cell.width + cell.height;
            for (let d = step; d < total; d += step) {
              ctx.beginPath();
              ctx.moveTo(cell.x + d, cell.y);
              ctx.lineTo(cell.x, cell.y + d);
              ctx.stroke();
            }
            ctx.restore();
          }
        }
      }
    };
    if (!overlay) renderGrid();
    for (const item of items) {
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.radiusFt, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.02;
      ctx.stroke();
    }
    if (overlay) renderGrid();
  },

  onDragOver(bounds, _shape, pos, items, config): DragFeedback | null {
    const { cols, rows, gapFt } = getGridDims(config);
    const { col, row } = posToCell(bounds, cols, rows, gapFt, pos);
    const center = cellCenter(bounds, cols, rows, gapFt, col, row);
    const occupied = new Set(items.map((i) => `${i.x},${i.y}`));
    if (occupied.has(`${center.x},${center.y}`)) return null;

    const cell = cellRect(bounds, cols, rows, gapFt, col, row);
    return {
      render(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = 'rgba(127,176,105,0.2)';
        ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
      },
    };
  },

  onDrop(bounds, _shape, pos, item, items, config): DropResult {
    const { cols, rows, gapFt } = getGridDims(config);
    const { col, row } = posToCell(bounds, cols, rows, gapFt, pos);
    const center = cellCenter(bounds, cols, rows, gapFt, col, row);
    const occupied = new Set(items.map((i) => `${i.x},${i.y}`));

    if (!occupied.has(`${center.x},${center.y}`)) {
      return { item: { ...item, x: center.x, y: center.y }, state: {} };
    }
    let bestDist = Infinity;
    let bestCenter = center;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const cc = cellCenter(bounds, cols, rows, gapFt, c, r);
        if (occupied.has(`${cc.x},${cc.y}`)) continue;
        const d = (cc.x - pos.x) ** 2 + (cc.y - pos.y) ** 2;
        if (d < bestDist) { bestDist = d; bestCenter = cc; }
      }
    }
    return { item: { ...item, x: bestCenter.x, y: bestCenter.y }, state: {} };
  },

  defaultConfig() {
    return { cols: 4, rows: 4, gapFt: 0 };
  },

  configSchema(): ConfigField[] {
    return [
      { key: 'cols', label: 'Columns', type: 'slider' as const, min: 1, max: 12, step: 1, default: 4 },
      { key: 'rows', label: 'Rows', type: 'slider' as const, min: 1, max: 12, step: 1, default: 4 },
    ];
  },
};
