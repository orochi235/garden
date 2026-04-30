export type TextRenderer = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
) => void;

export interface LabelOptions {
  align?: 'center' | 'left';
  fontSize?: number;
  renderText?: TextRenderer;
  /** Override the pill width (content width, excluding padding). */
  width?: number;
  /** Override the pill height (content height, excluding padding). */
  height?: number;
}

/** Render a text label with a 75%-opaque black pill background and white text. */
export function renderLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: LabelOptions = {},
): void {
  const { align = 'center', fontSize = 13, renderText, width, height } = options;

  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = 'top';
  const padX = 4;
  const padY = 1;
  const contentW = width ?? ctx.measureText(text).width;
  const contentH = height ?? fontSize;
  const w = contentW + padX * 2;
  const h = contentH + padY * 2;
  const rx = align === 'center' ? x - w / 2 : x - padX;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.roundRect(rx, y - padY, w, h, 3);
  ctx.fill();

  ctx.textAlign = align === 'center' ? 'center' : 'left';
  const tx = align === 'center' ? x : x;
  (renderText ?? defaultLabelTextRenderer)(ctx, text, tx, y);
  ctx.restore();
}

export const defaultLabelTextRenderer: TextRenderer = (ctx, text, x, y) => {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(text, x, y);
};
