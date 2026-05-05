import { describe, it, expect } from 'vitest';
import { computeTrellisedBack } from './trellisedBack';
import type { ParentBounds } from '../arrangement';

const rect: ParentBounds = { x: 0, y: 0, width: 6, length: 4, shape: 'rectangle' };

describe('computeTrellisedBack', () => {
  it('places trellis slots on the configured edge', () => {
    const slots = computeTrellisedBack(
      { type: 'trellised-back', trellisEdge: 'N', trellisDepthFt: 1, trellisPitchFt: 0.5, frontStrategy: 'rows', marginFt: 0 },
      rect,
      [],
    );
    const trellis = slots.filter((s) => s.y < 1);
    expect(trellis.length).toBeGreaterThan(0);
    expect(slots.length).toBeGreaterThan(trellis.length);
  });

  it('respects edge "S"', () => {
    const slots = computeTrellisedBack(
      { type: 'trellised-back', trellisEdge: 'S', trellisDepthFt: 1, trellisPitchFt: 0.5, frontStrategy: 'rows', marginFt: 0 },
      rect,
      [],
    );
    const trellis = slots.filter((s) => s.y > rect.y + rect.length - 1);
    expect(trellis.length).toBeGreaterThan(0);
  });
});
