/**
 * Arrangement — a general-purpose layout system for positioning child objects
 * within a parent's bounds. Works across any layer pairing: plantings in
 * containers, structures on zones, etc.
 *
 * An arrangement is data (stored on the parent) that describes *how* children
 * should be positioned. `computeSlots` is the pure function that turns that
 * description into concrete positions.
 */

export type ArrangementType = 'rows' | 'grid' | 'ring' | 'single' | 'free';

export interface RowsConfig {
  type: 'rows';
  /** Space between row centers (ft) */
  spacingFt: number;
  /** Space between items within a row (ft) */
  itemSpacingFt: number;
  /** Row direction: 0 = horizontal rows, 90 = vertical columns */
  direction: 0 | 90;
  /** Inset from container edge (ft) */
  marginFt: number;
}

export interface GridConfig {
  type: 'grid';
  /** Space between cell centers in X (ft) */
  spacingXFt: number;
  /** Space between cell centers in Y (ft) */
  spacingYFt: number;
  /** Inset from container edge (ft) */
  marginFt: number;
}

export interface RingConfig {
  type: 'ring';
  /** Number of items in the ring */
  count: number;
  /** Inset from container edge (ft) */
  marginFt: number;
  /** Starting angle in degrees (0 = top) */
  startAngleDeg: number;
}

export interface SingleConfig {
  type: 'single';
}

export interface FreeConfig {
  type: 'free';
}

export type Arrangement = RowsConfig | GridConfig | RingConfig | SingleConfig | FreeConfig;

export interface Slot {
  x: number;
  y: number;
}

export interface ParentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rectangle' | 'circle';
}

/**
 * Given an arrangement and parent bounds, compute the world-space positions
 * where child objects should be placed.
 */
export function computeSlots(arrangement: Arrangement, bounds: ParentBounds): Slot[] {
  switch (arrangement.type) {
    case 'rows':
      return computeRows(arrangement, bounds);
    case 'grid':
      return computeGrid(arrangement, bounds);
    case 'ring':
      return computeRing(arrangement, bounds);
    case 'single':
      return [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }];
    case 'free':
      return [];
  }
}

function isInsideBounds(px: number, py: number, bounds: ParentBounds, margin: number): boolean {
  if (bounds.shape === 'circle') {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rx = bounds.width / 2 - margin;
    const ry = bounds.height / 2 - margin;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return (
    px >= bounds.x + margin &&
    px <= bounds.x + bounds.width - margin &&
    py >= bounds.y + margin &&
    py <= bounds.y + bounds.height - margin
  );
}

function computeRows(config: RowsConfig, bounds: ParentBounds): Slot[] {
  const slots: Slot[] = [];
  const m = config.marginFt;
  const vertical = config.direction === 90;

  const primaryStart = vertical ? bounds.x + m : bounds.y + m;
  const primaryEnd = vertical ? bounds.x + bounds.width - m : bounds.y + bounds.height - m;
  const secondaryStart = vertical ? bounds.y + m : bounds.x + m;
  const secondaryEnd = vertical ? bounds.y + bounds.height - m : bounds.x + bounds.width - m;

  for (let p = primaryStart + config.spacingFt / 2; p <= primaryEnd; p += config.spacingFt) {
    for (
      let s = secondaryStart + config.itemSpacingFt / 2;
      s <= secondaryEnd;
      s += config.itemSpacingFt
    ) {
      const px = vertical ? p : s;
      const py = vertical ? s : p;
      if (isInsideBounds(px, py, bounds, m)) {
        slots.push({ x: px, y: py });
      }
    }
  }
  return slots;
}

function computeGrid(config: GridConfig, bounds: ParentBounds): Slot[] {
  const slots: Slot[] = [];
  const m = config.marginFt;

  for (
    let x = bounds.x + m + config.spacingXFt / 2;
    x <= bounds.x + bounds.width - m;
    x += config.spacingXFt
  ) {
    for (
      let y = bounds.y + m + config.spacingYFt / 2;
      y <= bounds.y + bounds.height - m;
      y += config.spacingYFt
    ) {
      if (isInsideBounds(x, y, bounds, m)) {
        slots.push({ x, y });
      }
    }
  }
  return slots;
}

function computeRing(config: RingConfig, bounds: ParentBounds): Slot[] {
  const slots: Slot[] = [];
  if (config.count <= 0) return slots;

  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const rx = bounds.width / 2 - config.marginFt;
  const ry = bounds.height / 2 - config.marginFt;
  if (rx <= 0 || ry <= 0) return slots;

  const startRad = (config.startAngleDeg * Math.PI) / 180;
  const step = (2 * Math.PI) / config.count;

  for (let i = 0; i < config.count; i++) {
    const angle = startRad + i * step;
    slots.push({
      x: cx + rx * Math.sin(angle),
      y: cy - ry * Math.cos(angle),
    });
  }
  return slots;
}

/** Sensible defaults per arrangement type. */
export function defaultArrangement(type: ArrangementType): Arrangement {
  switch (type) {
    case 'rows':
      return { type: 'rows', spacingFt: 0.5, itemSpacingFt: 0.5, direction: 0, marginFt: 0.25 };
    case 'grid':
      return { type: 'grid', spacingXFt: 0.5, spacingYFt: 0.5, marginFt: 0.25 };
    case 'ring':
      return { type: 'ring', count: 6, marginFt: 0.25, startAngleDeg: 0 };
    case 'single':
      return { type: 'single' };
    case 'free':
      return { type: 'free' };
  }
}
