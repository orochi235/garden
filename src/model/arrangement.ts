/**
 * Arrangement — a general-purpose layout system for positioning child objects
 * within a parent's bounds. Works across any layer pairing: plantings in
 * containers, structures on zones, etc.
 *
 * An arrangement is data (stored on the parent) that describes *how* children
 * should be positioned. `computeSlots` is the pure function that turns that
 * description into concrete positions.
 */
import { computeSquareFoot } from './arrangementStrategies/squareFoot';

export type ArrangementType = 'rows' | 'grid' | 'ring' | 'single' | 'free' | 'square-foot';

export interface RowsConfig {
  type: 'rows';
  /** Space between row centers (ft) */
  spacingFt: number;
  /** Space between items within a row (ft) */
  itemSpacingFt: number;
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

export interface SquareFootConfig {
  type: 'square-foot';
  /** Side length of each cell, feet. Default 1. */
  cellSizeFt: number;
  /** Inset from container edge (ft) */
  marginFt: number;
}

export type Arrangement = RowsConfig | GridConfig | RingConfig | SingleConfig | FreeConfig | SquareFootConfig;

export interface Slot {
  x: number;
  y: number;
  /** Set by the `multi` strategy so consumers can route drops to the originating sub-region. */
  regionId?: string;
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
export function computeSlots(arrangement: Arrangement, bounds: ParentBounds, _cultivars?: import('./cultivars').Cultivar[]): Slot[] {
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
    case 'square-foot':
      return computeSquareFoot(arrangement, bounds, _cultivars);
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

  for (let y = bounds.y + m + config.spacingFt / 2; y <= bounds.y + bounds.height - m; y += config.spacingFt) {
    for (
      let x = bounds.x + m + config.itemSpacingFt / 2;
      x <= bounds.x + bounds.width - m;
      x += config.itemSpacingFt
    ) {
      if (isInsideBounds(x, y, bounds, m)) {
        slots.push({ x, y });
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
      return { type: 'rows', spacingFt: 0.5, itemSpacingFt: 0.5, marginFt: 0.25 };
    case 'grid':
      return { type: 'grid', spacingXFt: 0.5, spacingYFt: 0.5, marginFt: 0.25 };
    case 'ring':
      return { type: 'ring', count: 6, marginFt: 0.25, startAngleDeg: 0 };
    case 'single':
      return { type: 'single' };
    case 'free':
      return { type: 'free' };
    case 'square-foot':
      return { type: 'square-foot', cellSizeFt: 1, marginFt: 0 };
  }
}
