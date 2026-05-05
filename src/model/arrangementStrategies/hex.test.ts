import { describe, it, expect } from 'vitest';
import { computeHex } from './hex';
import type { ParentBounds } from '../arrangement';

const rect: ParentBounds = { x: 0, y: 0, width: 4, length: 8, shape: 'rectangle' };

describe('computeHex', () => {
  it('produces staggered rows (even rows offset by half-pitch)', () => {
    const slots = computeHex({ type: 'hex', pitchFt: 1, marginFt: 0 }, rect, []);
    const ys = [...new Set(slots.map((s) => s.y))].sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(1);
    const row0 = slots.filter((s) => s.y === ys[0]).map((s) => s.x).sort();
    const row1 = slots.filter((s) => s.y === ys[1]).map((s) => s.x).sort();
    expect(row1[0]).not.toBe(row0[0]);
  });

  it('uses cultivar footprint when pitchFt is "auto"', () => {
    const slotsAutoSmall = computeHex(
      { type: 'hex', pitchFt: 'auto', marginFt: 0 },
      rect,
      [{ footprintFt: 0.25 } as never],
    );
    const slotsAutoLarge = computeHex(
      { type: 'hex', pitchFt: 'auto', marginFt: 0 },
      rect,
      [{ footprintFt: 1.0 } as never],
    );
    expect(slotsAutoSmall.length).toBeGreaterThan(slotsAutoLarge.length);
  });

  it('returns empty for invalid pitch', () => {
    expect(computeHex({ type: 'hex', pitchFt: 0, marginFt: 0 }, rect, [])).toEqual([]);
  });
});
