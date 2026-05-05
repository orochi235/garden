import { describe, it, expect } from 'vitest';
import { computeMulti } from './multi';
import type { ParentBounds } from '../arrangement';

const rect: ParentBounds = { x: 0, y: 0, width: 4, height: 4, shape: 'rectangle' };

describe('computeMulti', () => {
  it('returns no slots when regions are empty', () => {
    const slots = computeMulti({ type: 'multi', regions: [] }, rect, []);
    expect(slots).toEqual([]);
  });

  it('routes to each region and tags slots with regionId', () => {
    const slots = computeMulti(
      {
        type: 'multi',
        regions: [
          { id: 'A', bounds: { x: 0, y: 0, w: 0.5, h: 1 }, arrangement: { type: 'single' } },
          { id: 'B', bounds: { x: 0.5, y: 0, w: 0.5, h: 1 }, arrangement: { type: 'single' } },
        ],
      },
      rect,
      [],
    );
    expect(slots).toHaveLength(2);
    expect(slots.find((s) => s.regionId === 'A')).toBeDefined();
    expect(slots.find((s) => s.regionId === 'B')).toBeDefined();
  });

  it('clips region rects against parent bounds', () => {
    const slots = computeMulti(
      {
        type: 'multi',
        regions: [{ id: 'A', bounds: { x: -0.5, y: 0, w: 2, h: 1 }, arrangement: { type: 'single' } }],
      },
      rect,
      [],
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].x).toBeGreaterThanOrEqual(rect.x);
    expect(slots[0].x).toBeLessThanOrEqual(rect.x + rect.width);
  });
});
