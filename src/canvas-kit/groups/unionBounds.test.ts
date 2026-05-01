import { describe, expect, it } from 'vitest';
import { unionBounds } from './unionBounds';

describe('unionBounds', () => {
  it('returns null for empty input', () => {
    expect(unionBounds([])).toBeNull();
  });

  it('returns the rect itself for a single pose', () => {
    expect(unionBounds([{ x: 5, y: 6, width: 7, height: 8 }])).toEqual({
      x: 5,
      y: 6,
      width: 7,
      height: 8,
    });
  });

  it('computes envelope of two disjoint rects', () => {
    const out = unionBounds([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 50, y: 60, width: 20, height: 30 },
    ]);
    expect(out).toEqual({ x: 0, y: 0, width: 70, height: 90 });
  });

  it('handles negative coordinates', () => {
    const out = unionBounds([
      { x: -10, y: -20, width: 5, height: 5 },
      { x: 0, y: 0, width: 10, height: 10 },
    ]);
    expect(out).toEqual({ x: -10, y: -20, width: 20, height: 30 });
  });
});
