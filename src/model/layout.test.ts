import { describe, it, expect } from 'vitest';
import { getSlots, getGridCells, type ParentBounds } from './layout';

const rect: ParentBounds = { x: 0, y: 0, width: 4, length: 4, shape: 'rectangle' };

describe('getSlots – single', () => {
  it('returns center of bounds', () => {
    expect(getSlots({ type: 'single' }, rect)).toEqual([{ x: 2, y: 2 }]);
  });

  it('handles non-zero origin', () => {
    const b: ParentBounds = { x: 10, y: 5, width: 4, length: 4, shape: 'rectangle' };
    expect(getSlots({ type: 'single' }, b)).toEqual([{ x: 12, y: 7 }]);
  });
});

describe('getSlots – snap-points', () => {
  it('returns stored points offset by bounds origin', () => {
    const result = getSlots(
      { type: 'snap-points', points: [{ x: 1, y: 1 }, { x: 3, y: 3 }] },
      rect,
    );
    expect(result).toEqual([{ x: 1, y: 1 }, { x: 3, y: 3 }]);
  });

  it('returns empty list for no points', () => {
    expect(getSlots({ type: 'snap-points', points: [] }, rect)).toEqual([]);
  });
});

describe('getGridCells', () => {
  it('produces correct count for clean divisions', () => {
    // 4ft x 4ft bounds, 1ft cells → 4×4 = 16 cells
    expect(getGridCells(1, rect)).toHaveLength(16);
  });

  it('centers cells within bounds', () => {
    // 4ft x 4ft, 2ft cells → 4 cells at (1,1),(3,1),(1,3),(3,3)
    const cells = getGridCells(2, rect);
    expect(cells).toHaveLength(4);
    expect(cells[0]).toEqual({ x: 1, y: 1 });
    expect(cells[1]).toEqual({ x: 3, y: 1 });
    expect(cells[2]).toEqual({ x: 1, y: 3 });
    expect(cells[3]).toEqual({ x: 3, y: 3 });
  });

  it('returns empty for zero cell size', () => {
    expect(getGridCells(0, rect)).toEqual([]);
  });

  it('handles partial fit (floors to whole cells)', () => {
    // 3ft wide, 2ft cells → 1 col (floor(3/2)=1), center at x=1.5
    const b: ParentBounds = { x: 0, y: 0, width: 3, length: 2, shape: 'rectangle' };
    const cells = getGridCells(2, b);
    expect(cells).toHaveLength(1);
    expect(cells[0].x).toBeCloseTo(1.5);
    expect(cells[0].y).toBeCloseTo(1);
  });
});
