/**
 * Grid overlay — a reusable render layer that draws a world-space grid with
 * optional finer subdivisions, accent lines every N cells, and an optional
 * highlighted cell (e.g. a snap target preview).
 *
 * The layer renders in world space — the caller is expected to have applied
 * any view transform to the canvas context already. For viewport-aware grid
 * rendering with screen-space pixel snapping, see `renderGrid` in
 * `./renderGrid.ts`; this layer is the lower-friction primitive for use
 * inside a `runLayers([...])` stack.
 */

import type { RenderLayer } from './renderLayer';

export interface GridLayerOpts {
  /** Base cell size in world units. */
  cell: number;
  /** Bounds of the area to cover, in world units. */
  bounds: () => { x: number; y: number; width: number; height: number };
  /** Lines every N cells get the accent style. 0/undef = no accent. */
  accentEvery?: number;
  /** Optional finer subdivisions per cell. e.g. 4 -> 4 sub-lines per cell. */
  subdivisions?: number;
  style?: {
    line?: string;
    accent?: string;
    sub?: string;
    lineWidth?: number;
  };
  /** Optional: cell to highlight (e.g. snap target). */
  highlight?: () => { col: number; row: number } | null;
  highlightStyle?: { fill?: string };
}

const DEFAULT_STYLE = {
  line: '#2a2018',
  accent: '#3a2e22',
  sub: 'rgba(255,255,255,0.04)',
  lineWidth: 1,
};

const DEFAULT_HIGHLIGHT_STYLE = {
  fill: 'rgba(127,176,105,0.15)',
};

function drawVLine(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
}

function drawHLine(ctx: CanvasRenderingContext2D, y: number, x0: number, x1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
}

export function createGridLayer(opts: GridLayerOpts): RenderLayer<unknown> {
  const style = { ...DEFAULT_STYLE, ...(opts.style ?? {}) };
  const highlightStyle = { ...DEFAULT_HIGHLIGHT_STYLE, ...(opts.highlightStyle ?? {}) };

  return {
    id: 'grid',
    label: 'Grid',
    draw: (ctx: CanvasRenderingContext2D) => {
      const b = opts.bounds();
      if (b.width <= 0 || b.height <= 0) return;

      const { cell, accentEvery, subdivisions } = opts;
      const x0 = b.x;
      const y0 = b.y;
      const x1 = b.x + b.width;
      const y1 = b.y + b.height;

      // 1. Highlight (under everything) — single filled cell.
      if (opts.highlight) {
        const hl = opts.highlight();
        if (hl) {
          ctx.fillStyle = highlightStyle.fill;
          ctx.fillRect(x0 + hl.col * cell, y0 + hl.row * cell, cell, cell);
        }
      }

      ctx.lineWidth = style.lineWidth;

      // 2. Sub-lines (finest, drawn first so cell lines paint on top).
      if (subdivisions && subdivisions > 1) {
        ctx.strokeStyle = style.sub;
        const step = cell / subdivisions;
        for (let x = x0; x <= x1 + 1e-9; x += step) {
          // Skip lines that coincide with cell lines — those will be drawn next.
          const k = Math.round((x - x0) / step);
          if (k % subdivisions === 0) continue;
          drawVLine(ctx, x, y0, y1);
        }
        for (let y = y0; y <= y1 + 1e-9; y += step) {
          const k = Math.round((y - y0) / step);
          if (k % subdivisions === 0) continue;
          drawHLine(ctx, y, x0, x1);
        }
      }

      // 3. Cell lines (skip ones that will become accents).
      ctx.strokeStyle = style.line;
      let idx = 0;
      for (let x = x0; x <= x1 + 1e-9; x += cell) {
        const isAccent = !!accentEvery && accentEvery > 0 && idx % accentEvery === 0;
        if (!isAccent) drawVLine(ctx, x, y0, y1);
        idx++;
      }
      idx = 0;
      for (let y = y0; y <= y1 + 1e-9; y += cell) {
        const isAccent = !!accentEvery && accentEvery > 0 && idx % accentEvery === 0;
        if (!isAccent) drawHLine(ctx, y, x0, x1);
        idx++;
      }

      // 4. Accent lines on top.
      if (accentEvery && accentEvery > 0) {
        ctx.strokeStyle = style.accent;
        idx = 0;
        for (let x = x0; x <= x1 + 1e-9; x += cell) {
          if (idx % accentEvery === 0) drawVLine(ctx, x, y0, y1);
          idx++;
        }
        idx = 0;
        for (let y = y0; y <= y1 + 1e-9; y += cell) {
          if (idx % accentEvery === 0) drawHLine(ctx, y, x0, x1);
          idx++;
        }
      }
    },
  };
}
