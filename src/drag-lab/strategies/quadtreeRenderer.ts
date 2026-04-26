// Layer-based rendering for the quadtree strategy.
// Separated from quadtree.ts to keep tree operations and rendering distinct.

import type { LabItem, Rect, QuadNode } from '../types';
import { PX_PER_FT } from '../constants';

/** Ordered layer IDs — this is the default render order (bottom to top). */
export const QUADTREE_LAYER_IDS = [
  'microgrid',
  'footprint',
  'cellBorders',
  'occupied',
  'violations',
  'violationZone',
  'cellCounts',
  'objects',
] as const;

export type QuadtreeLayerId = typeof QUADTREE_LAYER_IDS[number];

export const QUADTREE_LAYER_LABELS: Record<QuadtreeLayerId, string> = {
  microgrid: 'Microgrid',
  footprint: 'Footprint',
  cellBorders: 'Cell borders',
  occupied: 'Occupied',
  violations: 'Violation',
  violationZone: 'Violation zone',
  cellCounts: 'Cell counts',
  objects: 'Objects',
};

export const QUADTREE_LAYER_CSS: Record<QuadtreeLayerId, string> = {
  microgrid: 'dl-legend-microgrid',
  footprint: 'dl-legend-footprint',
  cellBorders: 'dl-legend-borders',
  occupied: 'dl-legend-occupied',
  violations: 'dl-legend-violation',
  violationZone: 'dl-legend-violation-zone',
  cellCounts: 'dl-legend-cell-counts',
  objects: 'dl-legend-objects',
};

/** Config key controlling visibility for each layer. */
export const LAYER_CONFIG_KEY: Record<QuadtreeLayerId, string> = {
  microgrid: 'showMicrogrid',
  footprint: 'showFootprint',
  cellBorders: 'showCellBorders',
  occupied: 'showOccupied',
  violations: 'showViolations',
  violationZone: 'showViolationZone',
  cellCounts: 'showCellCounts',
  objects: 'showObjects',
};

/** Layers that default to off (must be explicitly enabled). */
export const LAYER_DEFAULT_OFF = new Set<QuadtreeLayerId>(['microgrid', 'cellCounts']);

/** Layers that cannot be toggled off. */
export const LAYER_ALWAYS_ON = new Set<QuadtreeLayerId>(['objects']);

export function layerEnabled(config: Record<string, unknown>, layer: QuadtreeLayerId): boolean {
  if (LAYER_ALWAYS_ON.has(layer)) return true;
  const val = config[LAYER_CONFIG_KEY[layer]];
  return LAYER_DEFAULT_OFF.has(layer) ? val === true : val !== false;
}

export function getLayerOrder(config: Record<string, unknown>): QuadtreeLayerId[] {
  const stored = config.layerOrder as QuadtreeLayerId[] | undefined;
  if (Array.isArray(stored) && stored.length === QUADTREE_LAYER_IDS.length) return stored;
  return [...QUADTREE_LAYER_IDS];
}

// --- Rendering helpers ---

/** Render parallel hatch lines inside a rect.
 *  @param rotation 0–1 representing a full turn (default 1/8 = 45deg)
 *  @param tileGlobal when true (default), lines align to global origin for seamless tiling */
/** Render parallel hatch lines inside a rect, aligned to the global origin for seamless tiling. */
function renderHatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, rotation = 1 / 8): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.02;
  const angle = rotation * Math.PI * 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const step = 0.1;

  const cx0 = x, cx1 = x + w, cy0 = y, cy1 = y + h;
  const normProj = [
    cx0 * cos + cy0 * sin,
    cx1 * cos + cy0 * sin,
    cx0 * cos + cy1 * sin,
    cx1 * cos + cy1 * sin,
  ];
  const lineProj = [
    -sin * cx0 + cos * cy0,
    -sin * cx1 + cos * cy0,
    -sin * cx0 + cos * cy1,
    -sin * cx1 + cos * cy1,
  ];
  const iMin = Math.floor(Math.min(...normProj) / step);
  const iMax = Math.ceil(Math.max(...normProj) / step);
  const sweep = Math.max(...lineProj.map(Math.abs)) + step;
  for (let i = iMin; i <= iMax; i++) {
    const d = i * step;
    const px = cos * d;
    const py = sin * d;
    ctx.beginPath();
    ctx.moveTo(px - sin * sweep, py + cos * sweep);
    ctx.lineTo(px + sin * sweep, py - cos * sweep);
    ctx.stroke();
  }
  ctx.restore();
}

function renderCrosshatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, rotation = 1 / 8): void {
  renderHatch(ctx, x, y, w, h, color, rotation);
  renderHatch(ctx, x, y, w, h, color, rotation + 0.25);
}

/** Stroke a rect inset so the border is drawn entirely inside the cell. */
function strokeRectInset(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const half = ctx.lineWidth / 2;
  ctx.strokeRect(x + half, y + half, w - ctx.lineWidth, h - ctx.lineWidth);
}

// --- Layer data ---

/** Pre-computed data shared across layer renderers. */
export interface LayerData {
  bounds: Rect;
  tree: QuadNode;
  items: LabItem[];
  occupied: Set<string>;
  violations: Set<string>;
  cellCounts: Map<string, number>;
  footprint: Rect[];
  maxDepth: number;
  depthScaledBorders: boolean;
  opaqueBorders: boolean;
}

function borderWidthFt(depth: number, data: LayerData): number {
  const px = data.depthScaledBorders ? Math.max(1, data.maxDepth - depth) : 1;
  return px / PX_PER_FT;
}

function borderColor(r: number, g: number, b: number, data: LayerData, alphaWhenNotOpaque = 0.4): string {
  return data.opaqueBorders ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alphaWhenNotOpaque})`;
}

// --- Individual layer renderers ---

function renderCellBordersNode(ctx: CanvasRenderingContext2D, node: QuadNode, data: LayerData): void {
  ctx.strokeStyle = borderColor(127, 176, 105, data, 0.3);
  ctx.lineWidth = borderWidthFt(node.depth, data);
  strokeRectInset(ctx, node.x, node.y, node.w, node.h);
  if (node.children) {
    for (const child of node.children) renderCellBordersNode(ctx, child, data);
  }
}

function renderOccupiedNode(ctx: CanvasRenderingContext2D, node: QuadNode, data: LayerData): void {
  if (node.children) {
    for (const child of node.children) renderOccupiedNode(ctx, child, data);
    return;
  }
  const key = `${node.x},${node.y}`;
  if (data.occupied.has(key) && !data.violations.has(key)) {
    renderHatch(ctx, node.x, node.y, node.w, node.h, 'rgba(255,255,255,0.4)');
  }
}

/** Check whether any virtual microgrid cell within a node's bounds is a violation. */
function hasViolationInBounds(node: QuadNode, violations: Set<string>, data: LayerData): boolean {
  const divisions = 1 << data.maxDepth;
  const cellW = data.bounds.width / divisions;
  const cellH = data.bounds.height / divisions;
  const minCol = Math.max(0, Math.round((node.x - data.bounds.x) / cellW));
  const maxCol = Math.round((node.x + node.w - data.bounds.x) / cellW) - 1;
  const minRow = Math.max(0, Math.round((node.y - data.bounds.y) / cellH));
  const maxRow = Math.round((node.y + node.h - data.bounds.y) / cellH) - 1;
  for (let c = minCol; c <= maxCol; c++) {
    for (let r = minRow; r <= maxRow; r++) {
      if (violations.has(`${data.bounds.x + c * cellW},${data.bounds.y + r * cellH}`)) return true;
    }
  }
  return false;
}

function renderViolationsLayer(ctx: CanvasRenderingContext2D, data: LayerData): void {
  if (data.violations.size === 0) return;
  const divisions = 1 << data.maxDepth;
  const cellW = data.bounds.width / divisions;
  const cellH = data.bounds.height / divisions;
  for (const key of data.violations) {
    const [xStr, yStr] = key.split(',');
    renderCrosshatch(ctx, Number(xStr), Number(yStr), cellW, cellH, 'rgba(224,80,80,0.5)');
  }
}

function renderViolationZoneNode(ctx: CanvasRenderingContext2D, node: QuadNode, data: LayerData): void {
  if (!node.children) return;
  if (hasViolationInBounds(node, data.violations, data)) {
    ctx.strokeStyle = borderColor(224, 80, 80, data, 0.4);
    ctx.lineWidth = borderWidthFt(node.depth, data);
    strokeRectInset(ctx, node.x, node.y, node.w, node.h);
  }
  for (const child of node.children) renderViolationZoneNode(ctx, child, data);
}

function renderMicrogrid(ctx: CanvasRenderingContext2D, data: LayerData): void {
  const cols = 1 << data.maxDepth;
  const rows = 1 << data.maxDepth;
  const cellW = data.bounds.width / cols;
  const cellH = data.bounds.height / rows;
  const { x: bx, y: by } = data.bounds;

  ctx.strokeStyle = borderColor(180, 180, 180, data, 0.25);
  ctx.lineWidth = 1 / PX_PER_FT;

  for (let c = 1; c < cols; c++) {
    const x = bx + c * cellW;
    ctx.beginPath();
    ctx.moveTo(x, by);
    ctx.lineTo(x, by + data.bounds.height);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = by + r * cellH;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.lineTo(bx + data.bounds.width, y);
    ctx.stroke();
  }
}

function renderFootprintLayer(ctx: CanvasRenderingContext2D, data: LayerData): void {
  for (const cell of data.footprint) {
    ctx.fillStyle = 'rgba(180,140,255,0.5)';
    ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
  }
}

function renderCellCountsLayer(ctx: CanvasRenderingContext2D, data: LayerData): void {
  if (data.cellCounts.size === 0) return;
  const divisions = 1 << data.maxDepth;
  const cellW = data.bounds.width / divisions;
  const cellH = data.bounds.height / divisions;
  const fontSize = Math.min(cellW, cellH) * 0.6;

  ctx.save();
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const [key, count] of data.cellCounts) {
    if (count < 1) continue;
    const [xStr, yStr] = key.split(',');
    const cx = Number(xStr) + cellW / 2;
    const cy = Number(yStr) + cellH / 2;
    const text = String(count);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = fontSize * 0.25;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = count > 1 ? 'rgba(224,80,80,0.9)' : 'rgba(255,255,255,0.7)';
    ctx.fillText(text, cx, cy);
  }
  ctx.restore();
}

function renderObjectsLayer(ctx: CanvasRenderingContext2D, data: LayerData): void {
  for (const item of data.items) {
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radiusFt, 0, Math.PI * 2);
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.02;
    ctx.stroke();
  }
}

const LAYER_RENDERERS: Record<QuadtreeLayerId, (ctx: CanvasRenderingContext2D, data: LayerData) => void> = {
  microgrid: (ctx, d) => renderMicrogrid(ctx, d),
  footprint: (ctx, d) => renderFootprintLayer(ctx, d),
  cellBorders: (ctx, d) => renderCellBordersNode(ctx, d.tree, d),
  occupied: (ctx, d) => renderOccupiedNode(ctx, d.tree, d),
  violations: (ctx, d) => renderViolationsLayer(ctx, d),
  violationZone: (ctx, d) => renderViolationZoneNode(ctx, d.tree, d),
  cellCounts: (ctx, d) => renderCellCountsLayer(ctx, d),
  objects: (ctx, d) => renderObjectsLayer(ctx, d),
};

export function renderLayers(ctx: CanvasRenderingContext2D, data: LayerData, config: Record<string, unknown>): void {
  const order = getLayerOrder(config);
  for (const layer of order) {
    if (layerEnabled(config, layer)) {
      LAYER_RENDERERS[layer](ctx, data);
    }
  }
}
