import { describe, expect, it } from 'vitest';
import type { ParentBounds } from './layout';
import {
  cellsTouchingCircle,
  computeOccupancy,
  resolveFootprint,
  validCellsForContainer,
  cellKey,
} from './cellOccupancy';

const RECT_4x8: ParentBounds = { x: 0, y: 0, width: 4, length: 8, shape: 'rectangle' };
const CIRCLE_2: ParentBounds = { x: 0, y: 0, width: 2, length: 2, shape: 'circle' };

describe('validCellsForContainer', () => {
  it('rect: returns rows × cols cells centered in bounds', () => {
    // 4×8 ft at 0.5 ft cells = 8 × 16 = 128 cells
    const cells = validCellsForContainer(RECT_4x8, 0.5);
    expect(cells.length).toBe(128);
    // First cell center at (0.25, 0.25)
    expect(cells[0]).toMatchObject({ col: 0, row: 0, x: 0.25, y: 0.25 });
  });

  it('rect: excludes partial-fit cells when grid does not divide evenly', () => {
    // 4×4 ft at 0.3 ft = 13 fit per side → 13×13 = 169 cells, leftover
    // (4 - 13×0.3) = 0.1 ft margin total = 0.05 ft per side
    const bounds: ParentBounds = { x: 0, y: 0, width: 4, length: 4, shape: 'rectangle' };
    const cells = validCellsForContainer(bounds, 0.3);
    expect(cells.length).toBe(13 * 13);
  });

  it('circle: only cells whose corners all fit inside the inscribed circle', () => {
    // 2 ft diameter circle, 0.5 ft cells. 4 cells across — only the 4 inner
    // ones whose corners are within radius 1 should pass; corner cells fail.
    const cells = validCellsForContainer(CIRCLE_2, 0.5);
    // The full 4×4 grid would be 16 cells; expect strictly fewer.
    expect(cells.length).toBeLessThan(16);
    // The 4 cells closest to center (corners at 0.5, 1.0, 1.5) are entirely
    // inside the radius-1 inscribed circle and MUST be present.
    expect(cells.find((c) => Math.abs(c.x - 0.75) < 0.01 && Math.abs(c.y - 0.75) < 0.01)).toBeDefined();
    expect(cells.find((c) => Math.abs(c.x - 1.25) < 0.01 && Math.abs(c.y - 1.25) < 0.01)).toBeDefined();
    // The 4 corner cells (centers at 0.25, 1.75) are outside or have corners
    // outside the inscribed circle — must be excluded.
    expect(cells.find((c) => Math.abs(c.x - 0.25) < 0.01 && Math.abs(c.y - 0.25) < 0.01)).toBeUndefined();
  });

  it('returns empty when cellSizeFt ≤ 0', () => {
    expect(validCellsForContainer(RECT_4x8, 0)).toEqual([]);
    expect(validCellsForContainer(RECT_4x8, -1)).toEqual([]);
  });
});

describe('cellsTouchingCircle', () => {
  it('returns the cells whose square overlaps the disk', () => {
    const cells = validCellsForContainer(RECT_4x8, 0.5);
    // Disk of radius 0.5 centered at (1, 1) touches a 2×2 region around it.
    const touched = cellsTouchingCircle(1, 1, 0.5, 0.5, cells);
    // Any cell whose center is within (radius + half-diag) of the circle
    // center is included. For 0.5 ft cells & 0.5 ft radius, expect the 4
    // cells around (1, 1) plus 4 corner cells if the disk extends to them.
    expect(touched.size).toBeGreaterThan(0);
    // Must include the cell containing (1, 1)
    expect(touched.has(cellKey(1, 1)) || touched.has(cellKey(2, 1)) || touched.has(cellKey(1, 2)) || touched.has(cellKey(2, 2))).toBe(true);
  });

  it('returns empty when radius is 0', () => {
    const cells = validCellsForContainer(RECT_4x8, 0.5);
    expect(cellsTouchingCircle(1, 1, 0, 0.5, cells).size).toBe(0);
  });
});

describe('computeOccupancy', () => {
  it('marks a single plant\'s footprint cells as occupied', () => {
    const fp = resolveFootprint({ cultivarId: 'cabbage.red', x: 1, y: 1 });
    if (!fp) throw new Error('cabbage.red missing from fixtures');
    const result = computeOccupancy({
      bounds: RECT_4x8,
      cellSizeFt: 1 / 6,
      plantings: [fp],
    });
    expect(result.occupied.size).toBeGreaterThan(0);
    expect(result.footprintConflict.size).toBe(0);
    expect(result.spacingConflict.size).toBe(0);
  });

  it('marks footprint conflict cells when two plants overlap', () => {
    const a = resolveFootprint({ cultivarId: 'cabbage.red', x: 1, y: 1 });
    // Overlapping b — same position
    const b = resolveFootprint({ cultivarId: 'cabbage.red', x: 1, y: 1 });
    if (!a || !b) throw new Error('cabbage.red missing');
    const result = computeOccupancy({
      bounds: RECT_4x8,
      cellSizeFt: 1 / 6,
      plantings: [a, b],
    });
    // Every cell touched by either footprint is touched by both → all in
    // footprintConflict.
    expect(result.footprintConflict.size).toBe(result.occupied.size);
  });

  it('marks spacing conflict cells when one plant\'s spacing covers another\'s footprint', () => {
    // Cabbage spacing is 1.5ft, footprint 1ft. Two cabbages 1.2 ft apart:
    // footprints (radius 0.5) DON'T overlap (centers 1.2ft apart > 1ft);
    // but spacing (radius 0.75) DOES touch the other's footprint.
    const a = resolveFootprint({ cultivarId: 'cabbage.red', x: 1, y: 1 });
    const b = resolveFootprint({ cultivarId: 'cabbage.red', x: 2.2, y: 1 });
    if (!a || !b) throw new Error('cabbage.red missing');
    const result = computeOccupancy({
      bounds: RECT_4x8,
      cellSizeFt: 1 / 6,
      plantings: [a, b],
    });
    expect(result.footprintConflict.size).toBe(0);
    expect(result.spacingConflict.size).toBeGreaterThan(0);
  });
});
