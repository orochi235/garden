/**
 * Cell-grid occupancy model for the `cell-grid` layout strategy.
 *
 * The grid divides a container into uniform-size square cells. A planting's
 * footprint disk *touches* a cell when the cell's square overlaps the disk;
 * touched cells are *occupied*. Placement is rejected when a new plant would
 * touch any cell already occupied by an existing plant. A separate overlay
 * derives spacing conflicts (cells touched by another plant's spacing radius)
 * and footprint conflicts (cells touched by ≥2 footprints — only happens
 * during drag previews under normal use).
 */
import { getCultivar } from './cultivars';
import type { ParentBounds } from './layout';
import type { Planting } from './types';

export interface CellRef {
  /** Column index (0-based, left to right). */
  col: number;
  /** Row index (0-based, top to bottom). */
  row: number;
  /** World x of cell's center. */
  x: number;
  /** World y of cell's center. */
  y: number;
}

export type CellKey = `${number},${number}`;

export function cellKey(col: number, row: number): CellKey {
  return `${col},${row}`;
}

/**
 * Generate cells inside a container's plantable bounds.
 *
 * For rectangular containers: every cell whose square fits inside the
 * rectangle. For circular containers: only cells whose entire square fits
 * inside the inscribed circle (corners must all be within radius). Cells
 * partially outside the boundary are excluded.
 *
 * Cells are anchored so the grid is centered on the container, with any
 * leftover space split evenly into a margin on each side.
 */
export function validCellsForContainer(
  bounds: ParentBounds,
  cellSizeFt: number,
): CellRef[] {
  if (cellSizeFt <= 0) return [];
  const cols = Math.floor(bounds.width / cellSizeFt);
  const rows = Math.floor(bounds.length / cellSizeFt);
  const offsetX = (bounds.width - cols * cellSizeFt) / 2;
  const offsetY = (bounds.length - rows * cellSizeFt) / 2;
  const out: CellRef[] = [];
  const isCircle = bounds.shape === 'circle';
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.length / 2;
  // For circles we use the inscribed circle (radius = min half-extent).
  const r = Math.min(bounds.width, bounds.length) / 2;
  const r2 = r * r;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = bounds.x + offsetX + col * cellSizeFt;
      const y0 = bounds.y + offsetY + row * cellSizeFt;
      const x1 = x0 + cellSizeFt;
      const y1 = y0 + cellSizeFt;
      if (isCircle) {
        // All four corners must be inside the inscribed circle.
        const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
        let allInside = true;
        for (const [px, py] of corners) {
          const dx = px - cx;
          const dy = py - cy;
          if (dx * dx + dy * dy > r2) { allInside = false; break; }
        }
        if (!allInside) continue;
      }
      out.push({ col, row, x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
    }
  }
  return out;
}

/**
 * Cells whose square overlaps the disk centered at (cx, cy) with radius r.
 *
 * Uses the closest-point-on-rect-to-circle-center distance test. Returns
 * a Set keyed by `${col},${row}` so callers can union/intersect with other
 * cell sets cheaply.
 */
export function cellsTouchingCircle(
  cx: number,
  cy: number,
  r: number,
  cellSizeFt: number,
  validCells: readonly CellRef[],
): Set<CellKey> {
  const out = new Set<CellKey>();
  if (r <= 0 || cellSizeFt <= 0) return out;
  const r2 = r * r;
  const half = cellSizeFt / 2;
  for (const cell of validCells) {
    // Distance from circle center to nearest point on the cell's square.
    const dx = Math.max(Math.abs(cx - cell.x) - half, 0);
    const dy = Math.max(Math.abs(cy - cell.y) - half, 0);
    if (dx * dx + dy * dy <= r2) {
      out.add(cellKey(cell.col, cell.row));
    }
  }
  return out;
}

interface PlantFootprint {
  x: number;
  y: number;
  /** Footprint radius in world feet. */
  rFootprint: number;
  /** Spacing radius in world feet (≥ rFootprint). */
  rSpacing: number;
}

/**
 * Resolve a planting to its footprint + spacing radii via the cultivar
 * database. Skips plantings whose cultivar is unknown.
 *
 * `originX` / `originY` are the parent's plantable-bounds origin so we can
 * convert from parent-local planting coords to world coords if needed; the
 * caller can pass the planting's already-resolved world coords by setting
 * origin to (0, 0).
 */
export function resolveFootprint(
  planting: Pick<Planting, 'cultivarId' | 'x' | 'y'>,
  originX = 0,
  originY = 0,
): PlantFootprint | null {
  const cultivar = getCultivar(planting.cultivarId);
  if (!cultivar) return null;
  const fp = cultivar.footprintFt ?? 0.5;
  const sp = Math.max(fp, cultivar.spacingFt ?? fp);
  return {
    x: originX + planting.x,
    y: originY + planting.y,
    rFootprint: fp / 2,
    rSpacing: sp / 2,
  };
}

export interface OccupancyInputs {
  bounds: ParentBounds;
  cellSizeFt: number;
  /** Plantings in WORLD coords (already offset by the parent's origin). */
  plantings: PlantFootprint[];
}

export interface OccupancyResult {
  /** Cells eligible to host a planting (inside the container). */
  validCells: CellRef[];
  /** Cells touched by at least one plant footprint. */
  occupied: Set<CellKey>;
  /** Cells touched by ≥2 plant footprints — a real overlap (drag preview). */
  footprintConflict: Set<CellKey>;
  /** Cells touched by another plant's spacing zone (excludes footprintConflict). */
  spacingConflict: Set<CellKey>;
}

/**
 * Compute occupancy + conflict overlays for a container.
 *
 * Single-pass:
 *   - For each plant, compute the cells touched by its footprint and spacing.
 *   - A cell is `footprintConflict` if it appears in ≥2 plants' footprint sets.
 *   - A cell is `spacingConflict` if it's in some plant's spacing set AND in a
 *     *different* plant's footprint set, but not already in footprintConflict.
 */
export function computeOccupancy(input: OccupancyInputs): OccupancyResult {
  const validCells = validCellsForContainer(input.bounds, input.cellSizeFt);
  const occupied = new Set<CellKey>();
  const footprintConflict = new Set<CellKey>();
  const spacingConflict = new Set<CellKey>();

  // Per-plant footprint and spacing cell sets.
  const footprintSets: Set<CellKey>[] = [];
  const spacingSets: Set<CellKey>[] = [];
  for (const p of input.plantings) {
    footprintSets.push(cellsTouchingCircle(p.x, p.y, p.rFootprint, input.cellSizeFt, validCells));
    spacingSets.push(cellsTouchingCircle(p.x, p.y, p.rSpacing, input.cellSizeFt, validCells));
  }

  // Tally how many footprints touch each cell.
  const footprintCount = new Map<CellKey, number>();
  for (const set of footprintSets) {
    for (const k of set) {
      const n = (footprintCount.get(k) ?? 0) + 1;
      footprintCount.set(k, n);
      occupied.add(k);
      if (n >= 2) footprintConflict.add(k);
    }
  }

  // Spacing conflict: cell is in plant A's spacing AND in plant B's footprint
  // (where A !== B). If the cell's already a footprint conflict, skip.
  for (let i = 0; i < input.plantings.length; i++) {
    const spacing = spacingSets[i];
    for (const k of spacing) {
      if (footprintConflict.has(k)) continue;
      // Is this cell in any OTHER plant's footprint?
      for (let j = 0; j < footprintSets.length; j++) {
        if (j === i) continue;
        if (footprintSets[j].has(k)) {
          spacingConflict.add(k);
          break;
        }
      }
    }
  }

  return { validCells, occupied, footprintConflict, spacingConflict };
}

/**
 * True iff placing a new footprint at (x, y) with radius r would touch only
 * cells that are NOT already occupied. Use this from placement code to gate
 * commits.
 */
export function canPlaceFootprint(
  bounds: ParentBounds,
  cellSizeFt: number,
  occupied: Set<CellKey>,
  cx: number,
  cy: number,
  rFootprint: number,
): boolean {
  const validCells = validCellsForContainer(bounds, cellSizeFt);
  const wanted = cellsTouchingCircle(cx, cy, rFootprint, cellSizeFt, validCells);
  if (wanted.size === 0) return false;
  for (const k of wanted) {
    if (occupied.has(k)) return false;
  }
  return true;
}
