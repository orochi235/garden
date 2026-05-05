import { describe, it, expect } from 'vitest';
import {
  defaultPitchFor,
  squareFootCountFor,
  defaultClearanceFor,
  companions,
} from './cultivarSpacing';
import type { Cultivar } from './cultivars';

const c = (over: Partial<Cultivar>): Cultivar => ({
  id: 'x',
  speciesId: 'tomato',
  name: 'x',
  category: 'vegetables',
  taxonomicName: 'X',
  variety: null,
  color: '#000',
  footprintFt: 1,
  spacingFt: 1,
  heightFt: undefined,
  climber: false,
  iconImage: null,
  iconBgColor: null,
  seedStarting: {} as never,
  ...over,
});

describe('defaultPitchFor', () => {
  it('returns footprintFt × 2 when footprintFt is present', () => {
    expect(defaultPitchFor(c({ footprintFt: 0.5 }))).toBe(1);
  });

  it('falls back per category when footprintFt is 0', () => {
    expect(defaultPitchFor(c({ footprintFt: 0, category: 'root-vegetables' }))).toBeGreaterThan(0);
  });
});

describe('squareFootCountFor', () => {
  it('buckets large footprint to 1', () => {
    expect(squareFootCountFor(c({ footprintFt: 1.5 }))).toBe(1);
  });
  it('buckets small footprint to 16', () => {
    expect(squareFootCountFor(c({ footprintFt: 0.2 }))).toBe(16);
  });
  it('returns 1 | 4 | 9 | 16 only', () => {
    for (const fp of [0.1, 0.3, 0.5, 0.8, 1.2, 2.0]) {
      expect([1, 4, 9, 16]).toContain(squareFootCountFor(c({ footprintFt: fp })));
    }
  });
});

describe('defaultClearanceFor', () => {
  it('returns 0 by default', () => {
    expect(defaultClearanceFor(c({}))).toBe(0);
  });
});

describe('companions', () => {
  it('symmetric lookup against the seed table', () => {
    const a = c({ speciesId: 'tomato' });
    const b = c({ speciesId: 'basil' });
    expect(companions(a, b)).toBe('companion');
    expect(companions(b, a)).toBe('companion');
  });

  it('returns null for unknown pairs', () => {
    const a = c({ speciesId: 'aardvark' });
    const b = c({ speciesId: 'badger' });
    expect(companions(a, b)).toBeNull();
  });
});
