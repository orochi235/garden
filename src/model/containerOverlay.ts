/**
 * Container overlays — visual aids rendered on top of container bodies
 * but below plantings. Each layout type defines what overlays it
 * supports. The system is generic: the same mechanism can render slot
 * dots, drop targets, snap guides, etc.
 *
 * An overlay is pure data describing what to draw. The renderer
 * (in the canvas layer) interprets the data and paints it.
 */

import { getSlots, type Layout, type ParentBounds } from './layout';

// --- Overlay primitives ---

export interface SlotDot {
  type: 'slot-dot';
  x: number;
  y: number;
  /** True if a planting already occupies this slot. */
  occupied: boolean;
}

export interface HighlightSlot {
  type: 'highlight-slot';
  x: number;
  y: number;
  radiusFt: number;
}

export type OverlayPrimitive = SlotDot | HighlightSlot;

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
 * Compute the static overlay for a container's layout.
 * Shows slot positions for single/snap-points layouts.
 * Grid overlay is owned by the weasel grid layer; nothing to add here.
 */
export function computeContainerOverlay(
  layout: Layout | null,
  bounds: ParentBounds,
  ctx: OverlayContext,
): ContainerOverlay {
  if (!layout || layout.type === 'grid') {
    // Grid overlay is owned by the weasel grid layer; nothing to add here.
    return { items: [] };
  }

  const slots = getSlots(layout, bounds);
  const items: OverlayPrimitive[] = slots.map((s) => {
    const relKey = `${s.x - bounds.x},${s.y - bounds.y}`;
    return { type: 'slot-dot', x: s.x, y: s.y, occupied: ctx.occupiedSlots.has(relKey) };
  });

  return { items };
}

/**
 * Compute the drag overlay for a container — highlights the nearest
 * unoccupied slot as a drop target.
 */
export function computeDragOverlay(
  layout: Layout | null,
  bounds: ParentBounds,
  ctx: DragOverlayContext,
): ContainerOverlay {
  if (!layout || layout.type === 'grid') {
    return { items: [] };
  }

  const slots = getSlots(layout, bounds);
  const target = nearestUnoccupied(slots, ctx.cursorX, ctx.cursorY, ctx.occupiedSlots, bounds);
  if (!target) return { items: [] };

  return {
    items: [{ type: 'highlight-slot', x: target.x, y: target.y, radiusFt: ctx.radiusFt }],
  };
}

function nearestUnoccupied(
  slots: { x: number; y: number }[],
  cx: number,
  cy: number,
  occupied: Set<string>,
  bounds: ParentBounds,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
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
