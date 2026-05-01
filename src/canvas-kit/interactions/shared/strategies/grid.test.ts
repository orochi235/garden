import { describe, expect, it } from 'vitest';
import { gridSnapStrategy } from './grid';
import { IMPERIAL_INCHES } from '../../../units';
import type { GestureContext } from '../../types';

interface Pose { x: number; y: number }

const ctx = {} as unknown as GestureContext<Pose>;

describe('gridSnapStrategy', () => {
  it('snaps a pose to the nearest cell with a bare numeric cell', () => {
    const s = gridSnapStrategy<Pose>(10);
    expect(s.snap({ x: 7, y: 13 }, ctx)).toEqual({ x: 10, y: 10 });
    expect(s.snap({ x: 24, y: -3 }, ctx)).toEqual({ x: 20, y: -0 });
  });

  it('snaps to the resolved base-unit grid when given a tagged cell', () => {
    // 1ft = 12in -> snap to multiples of 12.
    const s = gridSnapStrategy<Pose>({ value: 1, unit: 'ft' }, IMPERIAL_INCHES);
    expect(s.snap({ x: 5, y: 0 }, ctx)).toEqual({ x: 0, y: 0 });
    expect(s.snap({ x: 7, y: 17 }, ctx)).toEqual({ x: 12, y: 12 });
    expect(s.snap({ x: 30, y: 30 }, ctx)).toEqual({ x: 36, y: 36 });
  });

  it('throws when a tagged cell is given without a registry', () => {
    expect(() => gridSnapStrategy<Pose>({ value: 1, unit: 'ft' })).toThrow(/UnitRegistry/);
  });
});
