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

/** Collect all leaf node keys that are in the intersection zone of any two overlapping items. */
function findViolationCells(tree: QuadNode, items: LabItem[]): Set<string> {
  const violations = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const overlap = a.radiusFt + b.radiusFt - dist;
      if (overlap <= 0) continue;

      // Find cells in the overlap region (around the midpoint, radius = overlap/2)
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const overlapRadius = Math.max(overlap / 2, Math.min(a.radiusFt, b.radiusFt));
      const cells: QuadNode[] = [];
      nodesOverlappingCircle(tree, mx, my, overlapRadius, cells);
      for (const cell of cells) {
        violations.add(`${cell.x},${cell.y}`);
      }
    }
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
 *  @param rotation 0–1 representing a full turn (default 1/8 = 45°) */
function renderHatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, rotation = 1 / 8): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.02;
  const angle = rotation * Math.PI * 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const diagonal = Math.sqrt(w * w + h * h);
  const step = 0.1;
  const count = Math.ceil(diagonal / step);
  for (let i = -count; i <= count; i++) {
    const offset = i * step;
    const px = cx + cos * offset;
    const py = cy + sin * offset;
    ctx.beginPath();
    ctx.moveTo(px - sin * diagonal, py + cos * diagonal);
    ctx.lineTo(px + sin * diagonal, py - cos * diagonal);
    ctx.stroke();
  }
  ctx.restore();
}

function renderCrosshatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, rotation = 1 / 8): void {
  renderHatch(ctx, x, y, w, h, color, rotation);
  renderHatch(ctx, x, y, w, h, color, rotation + 0.5);
}

// --- Rendering ---

function layerFlags(config: Record<string, unknown>): LayerFlags {
  return {
    occupied: config.showOccupied !== false,
    violations: config.showViolations !== false,
    footprint: config.showFootprint !== false,
    target: config.showTarget !== false,
    splits: config.showSplits !== false,
    putative: config.showPutative !== false,
  };
}

interface LayerFlags {
  occupied: boolean;
  violations: boolean;
  footprint: boolean;
  target: boolean;
  splits: boolean;
  putative: boolean;
}

function renderNode(ctx: CanvasRenderingContext2D, node: QuadNode, occupied: Set<string>, violations: Set<string>, flags: LayerFlags): void {
  if (node.children) {
    for (const child of node.children) {
      renderNode(ctx, child, occupied, violations, flags);
    }
    return;
  }

  const key = `${node.x},${node.y}`;
  const isViolation = flags.violations && violations.has(key);
  const isOccupiedCell = flags.occupied && occupied.has(key);

  if (isViolation) {
    renderCrosshatch(ctx, node.x, node.y, node.w, node.h, 'rgba(224,80,80,0.5)');
  } else if (isOccupiedCell) {
    renderHatch(ctx, node.x, node.y, node.w, node.h, 'rgba(255,255,255,0.4)');
  }

  ctx.strokeStyle = isViolation ? 'rgba(224,123,155,0.4)' : isOccupiedCell ? 'rgba(127,176,105,0.2)' : 'rgba(127,176,105,0.3)';
  ctx.lineWidth = 0.01;
  ctx.strokeRect(node.x, node.y, node.w, node.h);
}

export const quadtreeStrategy: LayoutStrategy = {
  name: 'Quadtree',

  render(ctx, bounds, _shape, items, config) {
    const maxDepth = (config.maxDepth as number) ?? 4;
    const overlay = !!config.overlayGuides;
    const flags = layerFlags(config);
    const tree = buildTree(bounds, items, maxDepth);
    const occupiedCells = findOccupiedCells(tree, items);
    const violations = findViolationCells(tree, items);
    const deepest = maxLeafDepth(tree);
    const footprint = flags.footprint ? findFootprintCells(bounds, deepest, items) : [];

    const renderOverlays = () => {
      for (const cell of footprint) {
        ctx.fillStyle = 'rgba(180,140,255,0.5)';
        ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
        ctx.strokeStyle = 'rgba(180,140,255,0.8)';
        ctx.lineWidth = 0.015;
        ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);
      }
      renderNode(ctx, tree, occupiedCells, violations, flags);
    };

    if (!overlay) renderOverlays();
    for (const item of items) {
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.radiusFt, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.02;
      ctx.stroke();
    }
    if (overlay) renderOverlays();
  },

  onDragOver(bounds, _shape, pos, items, config): DragFeedback | null {
    const maxDepth = (config.maxDepth as number) ?? 4;
    const dragRadius = (config._dragRadius as number) ?? 0.25;
    const flags = layerFlags(config);
    const tree = buildTree(bounds, items, maxDepth);
    const targetDepth = depthForRadius(dragRadius, bounds, maxDepth);

    // Build a second tree for split detection — findDropNode mutates the tree
    // by calling subdivide(), so collectSplitPath would see already-split nodes.
    const splitTree = buildTree(bounds, items, maxDepth);

    const target = findDropNode(tree, pos, targetDepth, maxDepth);

    // Gray: all possible leaf cells at target depth
    const putativeCells: Rect[] = [];
    if (flags.putative) collectPutativeCells(tree, targetDepth, maxDepth, putativeCells);

    // Cyan: nodes that would actually be split to place the item at the target
    const splitNodes: Rect[] = [];
    if (target && flags.splits) {
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
        if (target && flags.target) {
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
