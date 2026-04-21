/**
 * Plant renderers — each plant is drawn as a transparent square with an opaque
 * diagonal hatch pattern, plus a stylized icon of the plant's product (fruit,
 * leaf, root, etc.) centered inside.
 *
 * `renderPlant(ctx, cultivarId, radius, color)` draws within a square from
 * (-radius, -radius) to (+radius, +radius), centered on the current origin.
 */

type IconRenderer = (ctx: CanvasRenderingContext2D, r: number, color: string) => void;

// ---------------------------------------------------------------------------
// Color normalization — ensure hatch patterns are perceptually equivalent
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  function hue2rgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Normalize a color for hatch rendering: desaturate by 60% and ensure
 *  at least 50% lightness so all hatch patterns are muted and equivalent. */
function normalizeHatchColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const ns = s * 0.4; // desaturate by 60%
  const nl = Math.max(0.5, l); // at least 50% light
  return hslToHex(h, ns, nl);
}

// ---------------------------------------------------------------------------
// Hatch background — shared by all plants
// ---------------------------------------------------------------------------

export type PlantShape = 'square' | 'circle';

function drawHatch(ctx: CanvasRenderingContext2D, radius: number, color: string, shape: PlantShape = 'square'): void {
  const hatchColor = normalizeHatchColor(color);
  const size = radius * 2;
  const half = radius;

  ctx.save();

  // Clip to shape
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
  } else {
    ctx.rect(-half, -half, size, size);
  }
  ctx.clip();

  // Diagonal lines
  ctx.strokeStyle = hatchColor;
  ctx.lineWidth = Math.max(1, radius * 0.08);
  ctx.globalAlpha = 0.55;
  const spacing = Math.max(3, radius * 0.25);
  const span = size * 2;
  for (let d = -span; d <= span; d += spacing) {
    ctx.beginPath();
    ctx.moveTo(d - half, -half);
    ctx.lineTo(d + half, half);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Border
  ctx.strokeStyle = hatchColor;
  ctx.lineWidth = Math.max(1, radius * 0.06);
  ctx.globalAlpha = 0.7;
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeRect(-half, -half, size, size);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Fruit / product icons
// ---------------------------------------------------------------------------

/** Round fruit — tomato, tomatillo, ground cherry */
function iconRoundFruit(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const s = r * 0.4;
  const squish = 0.85; // slightly oblate
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * squish, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = Math.max(0.5, s * 0.08);
  ctx.stroke();
  // Pointy calyx leaves fanning from near the top, horizontally centered
  const leafCount = 5;
  const leafLen = s * 0.45;
  const leafHalfW = s * 0.1;
  ctx.fillStyle = '#3A6A20';
  for (let i = 0; i < leafCount; i++) {
    const angle = ((i - (leafCount - 1) / 2) * Math.PI * 0.6) / (leafCount - 1);
    ctx.save();
    ctx.translate(0, -s * squish * 0.6);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-leafHalfW, -leafLen * 0.4);
    ctx.lineTo(0, -leafLen);
    ctx.lineTo(leafHalfW, -leafLen * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Elongated pepper shape */
function iconPepper(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const w = r * 0.18;
  const h = r * 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.bezierCurveTo(w * 1.4, -h * 0.6, w * 1.6, h * 0.3, w * 0.3, h);
  ctx.bezierCurveTo(0, h * 1.05, 0, h * 1.05, -w * 0.3, h);
  ctx.bezierCurveTo(-w * 1.6, h * 0.3, -w * 1.4, -h * 0.6, 0, -h);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.stroke();
  // Stem
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(0, -h - r * 0.12);
  ctx.strokeStyle = '#3A6A20';
  ctx.lineWidth = Math.max(0.5, r * 0.06);
  ctx.stroke();
}

/** Eggplant — teardrop shape */
function iconEggplant(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const w = r * 0.22;
  const h = r * 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.8);
  ctx.bezierCurveTo(w * 2, -h * 0.4, w * 2.2, h * 0.5, 0, h);
  ctx.bezierCurveTo(-w * 2.2, h * 0.5, -w * 2, -h * 0.4, 0, -h * 0.8);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.stroke();
  // Calyx
  ctx.beginPath();
  ctx.arc(0, -h * 0.75, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = '#4A7A30';
  ctx.fill();
}

/** Cucumber / zucchini — elongated oval */
function iconCucumber(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const w = r * 0.16;
  const h = r * 0.48;
  ctx.beginPath();
  ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.stroke();
  // Subtle stripes
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = Math.max(0.3, r * 0.02);
  for (const dx of [-w * 0.4, 0, w * 0.4]) {
    ctx.beginPath();
    ctx.moveTo(dx, -h * 0.8);
    ctx.lineTo(dx, h * 0.8);
    ctx.stroke();
  }
}

/** Large round melon */
function iconMelon(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const s = r * 0.42;
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = Math.max(0.5, s * 0.08);
  ctx.stroke();
  // Segment lines
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = Math.max(0.3, s * 0.04);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3);
    ctx.lineTo(Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.9);
    ctx.stroke();
  }
}

/** Lettuce / kale — ruffled leaf rosette */
function iconLeafRosette(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const s = r * 0.38;
  const leaves = 5;
  for (let i = 0; i < leaves; i++) {
    const angle = (i * Math.PI * 2) / leaves;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(s * 0.35, 0, s * 0.45, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = '#A8D48A';
  ctx.fill();
}

/** Carrot — orange triangle/wedge */
function iconCarrot(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const h = r * 0.55;
  const w = r * 0.18;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.4);
  ctx.bezierCurveTo(w, -h * 0.3, w * 0.8, h * 0.6, 0, h * 0.6);
  ctx.bezierCurveTo(-w * 0.8, h * 0.6, -w, -h * 0.3, 0, -h * 0.4);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.stroke();
  // Green top
  ctx.beginPath();
  ctx.moveTo(-r * 0.08, -h * 0.4);
  ctx.lineTo(-r * 0.12, -h * 0.7);
  ctx.moveTo(0, -h * 0.42);
  ctx.lineTo(0, -h * 0.75);
  ctx.moveTo(r * 0.08, -h * 0.4);
  ctx.lineTo(r * 0.12, -h * 0.7);
  ctx.strokeStyle = '#3A8A30';
  ctx.lineWidth = Math.max(0.5, r * 0.06);
  ctx.stroke();
}

/** Radish — small round root */
function iconRadish(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const s = r * 0.3;
  ctx.beginPath();
  ctx.arc(0, s * 0.1, s, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.stroke();
  // Root tip
  ctx.beginPath();
  ctx.moveTo(0, s * 1.1);
  ctx.lineTo(0, s * 1.6);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.5, r * 0.06);
  ctx.stroke();
  // Leaf sprout
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.8);
  ctx.lineTo(-r * 0.1, -s * 1.5);
  ctx.moveTo(0, -s * 0.8);
  ctx.lineTo(r * 0.1, -s * 1.5);
  ctx.strokeStyle = '#3A8A30';
  ctx.lineWidth = Math.max(0.5, r * 0.05);
  ctx.stroke();
}

/** Potato — lumpy oval */
function iconPotato(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const w = r * 0.36;
  const h = r * 0.28;
  ctx.beginPath();
  ctx.ellipse(0, 0, w, h, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.stroke();
  // Eyes
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (const [dx, dy] of [[-w * 0.4, -h * 0.2], [w * 0.2, h * 0.3], [w * 0.5, -h * 0.1]]) {
    ctx.beginPath();
    ctx.arc(dx, dy, r * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Herb sprig — small leafy branch */
function iconHerbSprig(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const h = r * 0.5;
  // Stem
  ctx.beginPath();
  ctx.moveTo(0, h * 0.4);
  ctx.lineTo(0, -h * 0.5);
  ctx.strokeStyle = '#5A8A40';
  ctx.lineWidth = Math.max(0.5, r * 0.06);
  ctx.stroke();
  // Leaf pairs
  const pairs = 3;
  for (let i = 0; i < pairs; i++) {
    const y = h * 0.2 - i * h * 0.3;
    const leafW = r * 0.18 * (1 - i * 0.15);
    const leafH = r * 0.1;
    ctx.beginPath();
    ctx.ellipse(-leafW * 0.6, y, leafW, leafH, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(leafW * 0.6, y, leafW, leafH, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/** Strawberry — heart shape */
function iconStrawberry(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const s = r * 0.35;
  ctx.beginPath();
  ctx.moveTo(0, s);
  ctx.bezierCurveTo(-s * 0.5, s * 0.6, -s * 1.2, -s * 0.2, 0, -s * 0.7);
  ctx.bezierCurveTo(s * 1.2, -s * 0.2, s * 0.5, s * 0.6, 0, s);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.stroke();
  // Seeds
  ctx.fillStyle = 'rgba(255,255,200,0.5)';
  for (const [dx, dy] of [[0, 0], [-s * 0.25, s * 0.3], [s * 0.25, s * 0.3], [0, -s * 0.3]]) {
    ctx.beginPath();
    ctx.ellipse(dx, dy, r * 0.02, r * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Leaves
  ctx.beginPath();
  ctx.moveTo(-r * 0.08, -s * 0.75);
  ctx.lineTo(-r * 0.15, -s * 1.1);
  ctx.moveTo(r * 0.08, -s * 0.75);
  ctx.lineTo(r * 0.15, -s * 1.1);
  ctx.strokeStyle = '#3A8A30';
  ctx.lineWidth = Math.max(0.5, r * 0.06);
  ctx.stroke();
}

/** Pea pod */
function iconPeaPod(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const w = r * 0.14;
  const h = r * 0.45;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.bezierCurveTo(w * 2, -h * 0.5, w * 2, h * 0.5, 0, h);
  ctx.bezierCurveTo(-w * 2, h * 0.5, -w * 2, -h * 0.5, 0, -h);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.stroke();
  // Peas inside
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  for (const dy of [-h * 0.35, 0, h * 0.35]) {
    ctx.beginPath();
    ctx.arc(0, dy, w * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Bean */
function iconBean(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const w = r * 0.12;
  const h = r * 0.42;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.bezierCurveTo(w * 1.8, -h * 0.5, w * 1.8, h * 0.5, w * 0.3, h);
  ctx.bezierCurveTo(-w * 1.5, h * 0.5, -w * 1.5, -h * 0.5, 0, -h);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.stroke();
}

/** Squash — bulbous gourd shape */
function iconSquash(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const s = r * 0.35;
  // Bulbous bottom
  ctx.beginPath();
  ctx.ellipse(0, s * 0.15, s * 0.9, s, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.stroke();
  // Stem
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.8);
  ctx.lineTo(0, -s * 1.2);
  ctx.strokeStyle = '#6A8A40';
  ctx.lineWidth = Math.max(0.5, r * 0.07);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Icon dispatch by icon type string (matches Species.icon / Cultivar.icon)
// ---------------------------------------------------------------------------

import type { IconType } from '../model/species';
import { getCultivar } from '../model/cultivars';

const iconRenderers: Record<IconType, IconRenderer> = {
  'round-fruit': iconRoundFruit,
  'pepper': iconPepper,
  'eggplant': iconEggplant,
  'cucumber': iconCucumber,
  'melon': iconMelon,
  'squash': iconSquash,
  'leaf-rosette': iconLeafRosette,
  'carrot': iconCarrot,
  'radish': iconRadish,
  'potato': iconPotato,
  'herb-sprig': iconHerbSprig,
  'strawberry': iconStrawberry,
  'pea-pod': iconPeaPod,
  'bean': iconBean,
};

function getIconRenderer(iconType: IconType): IconRenderer {
  return iconRenderers[iconType] ?? iconHerbSprig;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render a full plant tile (hatch background + icon) for a cultivar. */
export function renderPlant(
  ctx: CanvasRenderingContext2D,
  cultivarId: string,
  radius: number,
  color: string,
  shape: PlantShape = 'square',
): void {
  const cultivar = getCultivar(cultivarId);
  const iconType = cultivar?.icon ?? 'herb-sprig';
  const iconColor = color;
  drawHatch(ctx, radius, iconColor, shape);
  getIconRenderer(iconType)(ctx, radius, iconColor);
}

/** Render just the icon (no hatch) — used for palette buttons. */
export function renderIcon(
  ctx: CanvasRenderingContext2D,
  iconType: IconType,
  radius: number,
  color: string,
): void {
  getIconRenderer(iconType)(ctx, radius, color);
}
