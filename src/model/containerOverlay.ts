/**
 * Container overlays — visual aids rendered on top of container bodies
 * but below plantings. Each arrangement type defines what overlays it
 * supports. The system is generic: the same mechanism can render slot
 * dots, grid lines, drop targets, snap guides, etc.
 *
 * An overlay is pure data describing what to draw. The renderer
 * (in the canvas layer) interprets the data and paints it.
 */

import { computeSlots, type Arrangement, type ParentBounds, type Slot } from './arrangement';

// --- Overlay primitives ---

export interface SlotDot {
  type: 'slot-dot';
  x: number;
  y: number;
  /** True if a planting already occupies this slot. */
  occupied: boolean;
}

export interface GridLine {
  type: 'grid-line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface HighlightSlot {
  type: 'highlight-slot';
  x: number;
  y: number;
  radiusFt: number;
}

export type OverlayPrimitive = SlotDot | GridLine | HighlightSlot;

// --- Container overlay ---

export interface ContainerOverlay {
  /** Static overlay elements (always visible when overlay is enabled). */
  items: OverlayPrimitive[];
}

/** Options for computing overlays. */
export interface OverlayContext {
  /** Occupied slot positions as "x,y" keys (parent-relative). */
  occupiedSlots: Set<string>;
}

/** Options for computing drag overlays. */
export interface DragOverlayContext extends OverlayContext {
  /** Cursor position in world coords. */
  cursorX: number;
  cursorY: number;
  /** Footprint radius of the item being dragged. */
  radiusFt: number;
}

/**
 * Compute the static overlay for a container's arrangement.
 * Shows slot positions and grid structure.
 */
export function computeContainerOverlay(
  arrangement: Arrangement | null,
  bounds: ParentBounds,
  ctx: OverlayContext,
): ContainerOverlay {
  if (!arrangement || arrangement.type === 'free') {
    return { items: [] };
  }

  const slots = computeSlots(arrangement, bounds);
  const items: OverlayPrimitive[] = [];

  for (const slot of slots) {
    const relKey = `${slot.x - bounds.x},${slot.y - bounds.y}`;
    items.push({
      type: 'slot-dot',
      x: slot.x,
      y: slot.y,
      occupied: ctx.occupiedSlots.has(relKey),
    });
  }

  // Add grid lines for rows and grid arrangements
  if (arrangement.type === 'rows') {
    const m = arrangement.marginFt;
    for (let y = bounds.y + m + arrangement.spacingFt / 2; y <= bounds.y + bounds.height - m; y += arrangement.spacingFt) {
      items.push({
        type: 'grid-line',
        x1: bounds.x + m,
        y1: y,
        x2: bounds.x + bounds.width - m,
        y2: y,
      });
    }
  } else if (arrangement.type === 'grid') {
    const m = arrangement.marginFt;
    for (let x = bounds.x + m + arrangement.spacingXFt / 2; x <= bounds.x + bounds.width - m; x += arrangement.spacingXFt) {
      items.push({
        type: 'grid-line',
        x1: x,
        y1: bounds.y + m,
        x2: x,
        y2: bounds.y + bounds.height - m,
      });
    }
    for (let y = bounds.y + m + arrangement.spacingYFt / 2; y <= bounds.y + bounds.height - m; y += arrangement.spacingYFt) {
      items.push({
        type: 'grid-line',
        x1: bounds.x + m,
        y1: y,
        x2: bounds.x + bounds.width - m,
        y2: y,
      });
    }
  }

  return { items };
}

/**
 * Compute the drag overlay for a container — highlights the nearest
 * unoccupied slot as a drop target.
 */
export function computeDragOverlay(
  arrangement: Arrangement | null,
  bounds: ParentBounds,
  ctx: DragOverlayContext,
): ContainerOverlay {
  if (!arrangement || arrangement.type === 'free') {
    return { items: [] };
  }

  const slots = computeSlots(arrangement, bounds);
  const target = nearestUnoccupied(slots, ctx.cursorX, ctx.cursorY, ctx.occupiedSlots, bounds);

  const items: OverlayPrimitive[] = [];
  if (target) {
    items.push({
      type: 'highlight-slot',
      x: target.x,
      y: target.y,
      radiusFt: ctx.radiusFt,
    });
  }

  return { items };
}

function nearestUnoccupied(
  slots: Slot[],
  cx: number,
  cy: number,
  occupied: Set<string>,
  bounds: ParentBounds,
): Slot | null {
  let best: Slot | null = null;
  let bestDist = Infinity;
  for (const slot of slots) {
    const relKey = `${slot.x - bounds.x},${slot.y - bounds.y}`;
    if (occupied.has(relKey)) continue;
    const d = (slot.x - cx) ** 2 + (slot.y - cy) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = slot;
    }
  }
  return best;
}
