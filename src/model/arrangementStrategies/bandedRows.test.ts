import { describe, it, expect } from 'vitest';
import { computeBandedRows } from './bandedRows';
import type { ParentBounds } from '../arrangement';

const rect: ParentBounds = { x: 0, y: 0, width: 6, length: 4, shape: 'rectangle' };

describe('computeBandedRows', () => {
  it('honors per-band pitch', () => {
    const slots = computeBandedRows(
      {
        type: 'banded-rows',
        bands: [
          { depthFraction: 0.5, pitchFt: 1 },
          { depthFraction: 0.5, pitchFt: 0.5 },
        ],
        marginFt: 0,
      },
      rect,
      [],
    );
    const top = slots.filter((s) => s.y < 2);
    const bot = slots.filter((s) => s.y >= 2);
    expect(bot.length).toBeGreaterThan(top.length);
  });

  it('clamps when bands sum > 1', () => {
    const slots = computeBandedRows(
      {
        type: 'banded-rows',
        bands: [
          { depthFraction: 0.7, pitchFt: 1 },
          { depthFraction: 0.7, pitchFt: 1 },
        ],
        marginFt: 0,
      },
      rect,
      [],
    );
    expect(slots.every((s) => s.y >= rect.y && s.y <= rect.y + rect.length)).toBe(true);
  });
});
