import { describe, it, expect } from 'vitest';
import {
  dayOfYearToMmDd,
  zoneIndexToString,
  parseGrid,
  lookupFrostZone,
  type FrostZoneGrid,
} from './frostZone';

describe('dayOfYearToMmDd', () => {
  it('day 1 = January 1', () => {
    expect(dayOfYearToMmDd(1)).toBe('01-01');
  });
  it('day 60 = March 1 (non-leap reference)', () => {
    expect(dayOfYearToMmDd(60)).toBe('03-01');
  });
  it('day 79 = March 20', () => {
    // Atlanta sample row reports last frost = 03/20
    expect(dayOfYearToMmDd(79)).toBe('03-20');
  });
  it('day 365 = December 31', () => {
    expect(dayOfYearToMmDd(365)).toBe('12-31');
  });
  it('out of range returns empty', () => {
    expect(dayOfYearToMmDd(0)).toBe('');
    expect(dayOfYearToMmDd(400)).toBe('');
  });
});

describe('zoneIndexToString', () => {
  it('1 → 1a, 2 → 1b', () => {
    expect(zoneIndexToString(1)).toBe('1a');
    expect(zoneIndexToString(2)).toBe('1b');
  });
  it('13 → 7a, 14 → 7b', () => {
    expect(zoneIndexToString(13)).toBe('7a');
    expect(zoneIndexToString(14)).toBe('7b');
  });
  it('26 → 13b', () => {
    expect(zoneIndexToString(26)).toBe('13b');
  });
  it('out of range → unknown', () => {
    expect(zoneIndexToString(0)).toBe('unknown');
    expect(zoneIndexToString(27)).toBe('unknown');
  });
});

function buildSyntheticGrid(): { buf: ArrayBuffer; grid: FrostZoneGrid } {
  // 4x4 grid covering 30..32 N, -100..-98 W at 0.5 deg.
  const nLat = 4, nLon = 4;
  const buf = new ArrayBuffer(18 + nLat * nLon * 3);
  const v = new DataView(buf);
  v.setUint8(0, 'F'.charCodeAt(0));
  v.setUint8(1, 'Z'.charCodeAt(0));
  v.setUint8(2, 'G'.charCodeAt(0));
  v.setUint8(3, 'R'.charCodeAt(0));
  v.setUint8(4, 1);
  v.setUint8(5, 0);
  v.setInt16(6, 30 * 100, true);
  v.setInt16(8, -100 * 100, true);
  v.setUint16(10, 500, true);
  v.setUint16(12, 500, true);
  v.setUint16(14, nLat, true);
  v.setUint16(16, nLon, true);
  // Fill: only cell (li=2, oi=2) has data: doy=79 (3/20), zone=14 (7b).
  for (let i = 0; i < nLat * nLon; i++) {
    const off = 18 + i * 3;
    v.setUint8(off, 0); v.setUint8(off + 1, 0); v.setUint8(off + 2, 0);
  }
  const target = 18 + (2 * nLon + 2) * 3;
  v.setUint8(target, 79 & 0xff);
  v.setUint8(target + 1, (79 >> 8) & 0xff);
  v.setUint8(target + 2, 14);
  return { buf, grid: parseGrid(buf) };
}

describe('parseGrid + lookupFrostZone', () => {
  it('parses synthetic header + body', () => {
    const { grid } = buildSyntheticGrid();
    expect(grid.nLat).toBe(4);
    expect(grid.nLon).toBe(4);
    expect(grid.lat0).toBe(30);
    expect(grid.lon0).toBe(-100);
    expect(grid.latStep).toBe(0.5);
  });

  it('finds the in-cell value', () => {
    const { grid } = buildSyntheticGrid();
    // cell (li=2, oi=2): lat in [31, 31.5), lon in [-99, -98.5)
    const hit = lookupFrostZone(31.2, -98.7, grid);
    expect(hit).toEqual({ zone: '7b', lastFrost: '03-20' });
  });

  it('expands to nearest non-empty cell within 3 rings', () => {
    const { grid } = buildSyntheticGrid();
    // cell (li=0, oi=0): empty → expand to find (2,2)
    const hit = lookupFrostZone(30.1, -99.9, grid);
    expect(hit).toEqual({ zone: '7b', lastFrost: '03-20' });
  });

  it('returns null when far outside the grid', () => {
    const { grid } = buildSyntheticGrid();
    expect(lookupFrostZone(0, 0, grid)).toBeNull();
  });
});
