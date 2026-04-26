import type { LabItem, LayoutStrategy, Rect, Point, ConfigField, DragFeedback, DropResult } from '../types';

interface QuadNode {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  children: QuadNode[] | null;
  occupantId: string | null;
}

function makeNode(x: number, y: number, w: number, h: number, depth: number): QuadNode {
  return { x, y, w, h, depth, children: null, occupantId: null };
}

function subdivide(node: QuadNode): void {
  const hw = node.w / 2;
  const hh = node.h / 2;
  const d = node.depth + 1;
  node.children = [
    makeNode(node.x, node.y, hw, hh, d),
    makeNode(node.x + hw, node.y, hw, hh, d),
    makeNode(node.x, node.y + hh, hw, hh, d),
    makeNode(node.x + hw, node.y + hh, hw, hh, d),
  ];
}

function isOccupied(node: QuadNode): boolean {
  if (node.occupantId) return true;
  if (node.children) return node.children.every(isOccupied);
  return false;
}

/** Build a fresh quadtree from bounds, then place all existing items into it. */
function buildTree(bounds: Rect, items: LabItem[], maxDepth: number): QuadNode {
  const root = makeNode(bounds.x, bounds.y, bounds.width, bounds.height, 0);
  for (const item of items) {
    const depth = depthForRadius(item.radiusFt, bounds, maxDepth);
    insertItem(root, item, depth, maxDepth);
  }
  return root;
}

/** Determine the appropriate depth for a plant based on its radius.
 *  Subdivide while plant diameter < 2× cell width, stop when cell width <= radius. */
function depthForRadius(radius: number, bounds: Rect, maxDepth: number): number {
  const minDim = Math.min(bounds.width, bounds.height);
  for (let d = 0; d <= maxDepth; d++) {
    const cellSize = minDim / (1 << d);
    if (cellSize <= radius) return d;
  }
  return maxDepth;
}

/** Insert an item into the tree at the target depth, claiming the node it lands in. */
function insertItem(node: QuadNode, item: LabItem, targetDepth: number, maxDepth: number): boolean {
  if (!containsPoint(node, item)) return false;

  if (node.occupantId) return false;

  if (node.depth === targetDepth || node.depth >= maxDepth) {
    if (isOccupied(node)) return false;
    node.occupantId = item.id;
    node.children = null; // collapse any children
    return true;
  }

  if (!node.children) subdivide(node);
  for (const child of node.children!) {
    if (insertItem(child, item, targetDepth, maxDepth)) return true;
  }
  return false;
}

function containsPoint(node: QuadNode, pos: Point): boolean {
  return pos.x >= node.x && pos.x < node.x + node.w &&
         pos.y >= node.y && pos.y < node.y + node.h;
}

/** Find the best unoccupied node for a drop at a given depth. */
function findDropNode(node: QuadNode, pos: Point, targetDepth: number, maxDepth: number): QuadNode | null {
  if (node.occupantId) return null;

  if (node.depth === targetDepth || node.depth >= maxDepth) {
    return isOccupied(node) ? null : node;
  }

  if (!node.children) subdivide(node);

  // Try the quadrant containing the cursor first
  for (const child of node.children!) {
    if (containsPoint(child, pos)) {
      const result = findDropNode(child, pos, targetDepth, maxDepth);
      if (result) return result;
    }
  }

  // Fall back to nearest unoccupied quadrant at target depth
  let best: QuadNode | null = null;
  let bestDist = Infinity;
  for (const child of node.children!) {
    const candidate = findDropNode(child, pos, targetDepth, maxDepth);
    if (candidate) {
      const cx = candidate.x + candidate.w / 2;
      const cy = candidate.y + candidate.h / 2;
      const d = (cx - pos.x) ** 2 + (cy - pos.y) ** 2;
      if (d < bestDist) { bestDist = d; best = candidate; }
    }
  }
  return best;
}

/** Collect all cells that would exist if the tree were fully subdivided to targetDepth.
 *  Only emits cells that don't already exist in the tree (i.e., new splits). */
function collectPutativeCells(node: QuadNode, targetDepth: number, maxDepth: number, out: Rect[]): void {
  if (node.occupantId) return;
  const effectiveMax = Math.min(targetDepth, maxDepth);
  if (node.depth >= effectiveMax) return;

  if (!node.children) {
    // This node would be split — collect all descendant leaves at targetDepth
    collectAllSplits(node.x, node.y, node.w, node.h, node.depth, effectiveMax, out);
  } else {
    for (const child of node.children) {
      collectPutativeCells(child, targetDepth, maxDepth, out);
    }
  }
}

/** Recursively enumerate all leaf cells from a hypothetical subdivision. */
function collectAllSplits(x: number, y: number, w: number, h: number, depth: number, targetDepth: number, out: Rect[]): void {
  if (depth >= targetDepth) {
    out.push({ x, y, width: w, height: h });
    return;
  }
  const hw = w / 2;
  const hh = h / 2;
  const d = depth + 1;
  collectAllSplits(x, y, hw, hh, d, targetDepth, out);
  collectAllSplits(x + hw, y, hw, hh, d, targetDepth, out);
  collectAllSplits(x, y + hh, hw, hh, d, targetDepth, out);
  collectAllSplits(x + hw, y + hh, hw, hh, d, targetDepth, out);
}

/** Collect unsplit nodes along the path from root to target that would need to subdivide. */
function collectSplitPath(node: QuadNode, target: QuadNode, out: Rect[]): void {
  if (node.depth >= target.depth) return;

  // Check if the target is within this node's bounds
  const tx = target.x + target.w / 2;
  const ty = target.y + target.h / 2;
  if (tx < node.x || tx >= node.x + node.w || ty < node.y || ty >= node.y + node.h) return;

  // This node would need to be split if it doesn't already have children
  if (!node.children) {
    out.push({ x: node.x, y: node.y, width: node.w, height: node.h });
    // Continue down the putative path
    const hw = node.w / 2;
    const hh = node.h / 2;
    const d = node.depth + 1;
    const putative = [
      makeNode(node.x, node.y, hw, hh, d),
      makeNode(node.x + hw, node.y, hw, hh, d),
      makeNode(node.x, node.y + hh, hw, hh, d),
      makeNode(node.x + hw, node.y + hh, hw, hh, d),
    ];
    for (const child of putative) {
      collectSplitPath(child, target, out);
    }
  } else {
    for (const child of node.children) {
      collectSplitPath(child, target, out);
    }
  }
}

// --- Intersection detection ---

/** Find all leaf nodes whose area overlaps a circle. */
function nodesOverlappingCircle(node: QuadNode, cx: number, cy: number, r: number, out: QuadNode[]): void {
  // AABB vs circle test
  const nearestX = Math.max(node.x, Math.min(cx, node.x + node.w));
  const nearestY = Math.max(node.y, Math.min(cy, node.y + node.h));
  if ((nearestX - cx) ** 2 + (nearestY - cy) ** 2 > r * r) return;

  if (node.children) {
    for (const child of node.children) nodesOverlappingCircle(child, cx, cy, r, out);
    return;
  }
  out.push(node);
}

/** Collect all leaf node keys overlapped by any item's circle. */
function findOccupiedCells(tree: QuadNode, items: LabItem[]): Set<string> {
  const occupied = new Set<string>();
  for (const item of items) {
    const cells: QuadNode[] = [];
    nodesOverlappingCircle(tree, item.x, item.y, item.radiusFt, cells);
    for (const cell of cells) {
      occupied.add(`${cell.x},${cell.y}`);
    }
  }
  return occupied;
}

/** Count how many items overlap each virtual microgrid cell at the given depth.
 *  Operates over the full theoretical grid, not just subdivided tree nodes. */
function countCellOccupants(bounds: Rect, depth: number, items: LabItem[]): Map<string, number> {
  if (items.length === 0 || depth === 0) return new Map();
  const cols = 1 << depth;
  const rows = 1 << depth;
  const cellW = bounds.width / cols;
  const cellH = bounds.height / rows;
  const counts = new Map<string, number>();

  for (const item of items) {
    const minCol = Math.max(0, Math.floor((item.x - item.radiusFt - bounds.x) / cellW));
    const maxCol = Math.min(cols - 1, Math.floor((item.x + item.radiusFt - bounds.x) / cellW));
    const minRow = Math.max(0, Math.floor((item.y - item.radiusFt - bounds.y) / cellH));
    const maxRow = Math.min(rows - 1, Math.floor((item.y + item.radiusFt - bounds.y) / cellH));

    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        const cx = bounds.x + c * cellW;
        const cy = bounds.y + r * cellH;
        const nearestX = Math.max(cx, Math.min(item.x, cx + cellW));
        const nearestY = Math.max(cy, Math.min(item.y, cy + cellH));
        if ((nearestX - item.x) ** 2 + (nearestY - item.y) ** 2 <= item.radiusFt * item.radiusFt) {
          const key = `${cx},${cy}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

/** Collect leaf cell keys at the deepest level occupied by more than one item. */
function findViolationCells(counts: Map<string, number>): Set<string> {
  const violations = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) violations.add(key);
  }
  return violations;
}

/** Find the deepest leaf depth in the tree. */
function maxLeafDepth(node: QuadNode): number {
  if (!node.children) return node.depth;
  let max = 0;
  for (const child of node.children) {
    max = Math.max(max, maxLeafDepth(child));
  }
  return max;
}

/** Collect all virtual cells at a given depth that overlap a circle.
 *  These cells don't need to exist in the tree — we compute them from the bounds. */
function findFootprintCells(bounds: Rect, depth: number, items: LabItem[]): Rect[] {
  if (items.length === 0 || depth === 0) return [];
  const cols = 1 << depth;
  const rows = 1 << depth;
  const cellW = bounds.width / cols;
  const cellH = bounds.height / rows;

  const out: Rect[] = [];
  for (const item of items) {
    // Narrow search to cells near the item
    const minCol = Math.max(0, Math.floor((item.x - item.radiusFt - bounds.x) / cellW));
    const maxCol = Math.min(cols - 1, Math.floor((item.x + item.radiusFt - bounds.x) / cellW));
    const minRow = Math.max(0, Math.floor((item.y - item.radiusFt - bounds.y) / cellH));
    const maxRow = Math.min(rows - 1, Math.floor((item.y + item.radiusFt - bounds.y) / cellH));

    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        const cx = bounds.x + c * cellW;
        const cy = bounds.y + r * cellH;
        // AABB vs circle
        const nearestX = Math.max(cx, Math.min(item.x, cx + cellW));
        const nearestY = Math.max(cy, Math.min(item.y, cy + cellH));
        if ((nearestX - item.x) ** 2 + (nearestY - item.y) ** 2 <= item.radiusFt * item.radiusFt) {
          out.push({ x: cx, y: cy, width: cellW, height: cellH });
        }
      }
    }
  }
  return out;
}

/** Render parallel hatch lines inside a rect.
 *  @param rotation 0–1 representing a full turn (default 1/8 = 45°)
 *  @param tileGlobal when true (default), lines align to global origin for seamless tiling */
function renderHatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, rotation = 1 / 8, tileGlobal = true): void {
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

  if (tileGlobal) {
    // Align to global origin so patterns tile seamlessly across adjacent cells.
    // Project cell corners onto the normal axis to find which line indices to draw,
    // and onto the line axis to find how long each line must be.
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
  } else {
    const sweep = Math.sqrt(w * w + h * h);
    // Center-relative: each cell gets its own pattern (no tiling)
    const cx = x + w / 2;
    const cy = y + h / 2;
    const count = Math.ceil(sweep / step);
    for (let i = -count; i <= count; i++) {
      const d = i * step;
      const px = cx + cos * d;
      const py = cy + sin * d;
      ctx.beginPath();
      ctx.moveTo(px - sin * sweep, py + cos * sweep);
      ctx.lineTo(px + sin * sweep, py - cos * sweep);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function renderCrosshatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, rotation = 1 / 8, tileGlobal = true): void {
  renderHatch(ctx, x, y, w, h, color, rotation, tileGlobal);
  renderHatch(ctx, x, y, w, h, color, rotation + 0.25, tileGlobal);
}

// --- Layer-based rendering ---

/** Pixels per foot — must match CanvasRenderer.tsx PX_PER_FT. */
const PX_PER_FT = 160;

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
const LAYER_CONFIG_KEY: Record<QuadtreeLayerId, string> = {
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

function layerEnabled(config: Record<string, unknown>, layer: QuadtreeLayerId): boolean {
  if (LAYER_ALWAYS_ON.has(layer)) return true;
  const val = config[LAYER_CONFIG_KEY[layer]];
  return LAYER_DEFAULT_OFF.has(layer) ? val === true : val !== false;
}

function getLayerOrder(config: Record<string, unknown>): QuadtreeLayerId[] {
  const stored = config.layerOrder as QuadtreeLayerId[] | undefined;
  if (Array.isArray(stored) && stored.length === QUADTREE_LAYER_IDS.length) return stored;
  return [...QUADTREE_LAYER_IDS];
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

/** Stroke a rect inset so the border is drawn entirely inside the cell. */
function strokeRectInset(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const half = ctx.lineWidth / 2;
  ctx.strokeRect(x + half, y + half, w - ctx.lineWidth, h - ctx.lineWidth);
}

/** Pre-computed data shared across layer renderers. */
interface LayerData {
  bounds: Rect;
  tree: QuadNode;
  items: LabItem[];
  occupied: Set<string>;
  violations: Set<string>;
  /** Per-cell occupant counts at deepest leaf depth (key = "x,y"). */
  cellCounts: Map<string, number>;
  footprint: Rect[];
  maxDepth: number;
  /** When true, border thickness scales inversely with depth. */
  depthScaledBorders: boolean;
  /** When true, borders are fully opaque; otherwise semi-transparent. */
  opaqueBorders: boolean;
  /** When true, hatch/crosshatch lines tile seamlessly across adjacent cells. */
  tiledPatterns: boolean;
}

/** Compute border width in world units for a node at the given depth. */
function borderWidthFt(depth: number, data: LayerData): number {
  const px = data.depthScaledBorders ? Math.max(1, data.maxDepth - depth) : 1;
  return px / PX_PER_FT;
}

/** Return a color string at the appropriate opacity for borders. */
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
    renderHatch(ctx, node.x, node.y, node.w, node.h, 'rgba(255,255,255,0.4)', 1 / 8, data.tiledPatterns);
  }
}

function renderViolationsLayer(ctx: CanvasRenderingContext2D, data: LayerData): void {
  if (data.violations.size === 0) return;
  const divisions = 1 << data.maxDepth;
  const cellW = data.bounds.width / divisions;
  const cellH = data.bounds.height / divisions;
  for (const key of data.violations) {
    const [xStr, yStr] = key.split(',');
    renderCrosshatch(ctx, Number(xStr), Number(yStr), cellW, cellH, 'rgba(224,80,80,0.5)', 1 / 8, data.tiledPatterns);
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

function renderLayers(ctx: CanvasRenderingContext2D, data: LayerData, config: Record<string, unknown>): void {
  const order = getLayerOrder(config);
  for (const layer of order) {
    if (layerEnabled(config, layer)) {
      LAYER_RENDERERS[layer](ctx, data);
    }
  }
}

export const quadtreeStrategy: LayoutStrategy = {
  name: 'Quadtree',

  render(ctx, bounds, _shape, items, config) {
    const maxDepth = (config.maxDepth as number) ?? 4;
    const tree = buildTree(bounds, items, maxDepth);
    const occupied = findOccupiedCells(tree, items);
    const deepest = maxLeafDepth(tree);
    const cellCounts = countCellOccupants(bounds, deepest, items);
    const violations = findViolationCells(cellCounts);
    const footprint = layerEnabled(config, 'footprint') ? findFootprintCells(bounds, deepest, items) : [];
    const data: LayerData = {
      bounds, tree, items, occupied, violations, cellCounts, footprint, maxDepth,
      depthScaledBorders: config.depthScaledBorders !== false,
      opaqueBorders: config.opaqueBorders !== false,
      tiledPatterns: config.tiledPatterns !== false,
    };

    renderLayers(ctx, data, config);
  },

  onDragOver(bounds, _shape, pos, items, config): DragFeedback | null {
    const maxDepth = (config.maxDepth as number) ?? 4;
    const dragRadius = (config._dragRadius as number) ?? 0.25;
    const tree = buildTree(bounds, items, maxDepth);
    const targetDepth = depthForRadius(dragRadius, bounds, maxDepth);

    // Build a second tree for split detection — findDropNode mutates the tree
    // by calling subdivide(), so collectSplitPath would see already-split nodes.
    const splitTree = buildTree(bounds, items, maxDepth);

    const target = findDropNode(tree, pos, targetDepth, maxDepth);

    const showPutative = config.showPutative !== false;
    const showTarget = config.showTarget !== false;
    const showSplits = config.showSplits !== false;

    // Gray: all possible leaf cells at target depth
    const putativeCells: Rect[] = [];
    if (showPutative) collectPutativeCells(tree, targetDepth, maxDepth, putativeCells);

    // Cyan: nodes that would actually be split to place the item at the target
    const splitNodes: Rect[] = [];
    if (target && showSplits) {
      collectSplitPath(splitTree, target, splitNodes);
    }

    const snap = config.snapToCenter !== false;

    if (!target && putativeCells.length === 0) return null;
    return {
      hide: snap ? 'ghost' as const : 'preview' as const,
      render(ctx: CanvasRenderingContext2D) {
        // Bottom layer: gray — all possible subdivisions at target depth
        for (const cell of putativeCells) {
          ctx.strokeStyle = 'rgba(180,180,180,0.3)';
          ctx.lineWidth = 0.015;
          ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);
        }

        // Middle layer: green — the target cell
        if (target && showTarget) {
          ctx.fillStyle = 'rgba(127,176,105,0.2)';
          ctx.fillRect(target.x, target.y, target.w, target.h);
          ctx.strokeStyle = 'rgba(127,176,105,0.6)';
          ctx.lineWidth = 0.03;
          ctx.strokeRect(target.x, target.y, target.w, target.h);
        }

        // Top layer: cyan — nodes that would actually be split
        for (const cell of splitNodes) {
          ctx.strokeStyle = 'rgba(0,220,240,0.7)';
          ctx.lineWidth = 0.04;
          ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);
        }
      },
    };
  },

  onDrop(bounds, _shape, pos, item, items, config): DropResult {
    const maxDepth = (config.maxDepth as number) ?? 4;
    const snap = config.snapToCenter !== false;
    const tree = buildTree(bounds, items, maxDepth);
    const targetDepth = depthForRadius(item.radiusFt, bounds, maxDepth);
    const target = findDropNode(tree, pos, targetDepth, maxDepth);
    if (!target) return { item: { ...item, x: pos.x, y: pos.y }, state: {} };
    const dropX = snap ? target.x + target.w / 2 : Math.max(target.x, Math.min(target.x + target.w, pos.x));
    const dropY = snap ? target.y + target.h / 2 : Math.max(target.y, Math.min(target.y + target.h, pos.y));
    return {
      item: { ...item, x: dropX, y: dropY },
      state: {},
    };
  },

  defaultConfig() {
    return { maxDepth: 4, snapToCenter: true };
  },

  configSchema(): ConfigField[] {
    return [
      { key: 'maxDepth', label: 'Max Depth', type: 'slider' as const, min: 1, max: 6, step: 1, default: 4 },
      { key: 'snapToCenter', label: 'Snap to area center', type: 'checkbox' as const, default: true },
    ];
  },
};
