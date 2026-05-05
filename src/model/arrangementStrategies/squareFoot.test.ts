import { describe, it, expect } from 'vitest';
import { computeSquareFoot } from './squareFoot';
import type { ParentBounds } from '../arrangement';

const rect: ParentBounds = { x: 0, y: 0, width: 4, height: 8, shape: 'rectangle' };

describe('computeSquareFoot', () => {
  it('returns one slot per cell at cell center', () => {
    const slots = computeSquareFoot({ type: 'square-foot', cellSizeFt: 1, marginFt: 0 }, rect, []);
    expect(slots).toHaveLength(4 * 8);
    expect(slots[0]).toEqual(expect.objectContaining({ x: 0.5, y: 0.5 }));
  });

  it('honors marginFt', () => {
    const slots = computeSquareFoot({ type: 'square-foot', cellSizeFt: 1, marginFt: 0.5 }, rect, []);
    expect(slots).toHaveLength(3 * 7);
  });

  it('skips cells that fall outside circular bounds', () => {
    const circle: ParentBounds = { x: 0, y: 0, width: 4, height: 4, shape: 'circle' };
    const slots = computeSquareFoot({ type: 'square-foot', cellSizeFt: 1, marginFt: 0 }, circle, []);
    expect(slots.length).toBeLessThan(16);
  });
});
