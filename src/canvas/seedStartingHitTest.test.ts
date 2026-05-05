import { describe, expect, it } from 'vitest';
import { createTray, trayInteriorOffsetIn } from '../model/seedStarting';
import {
  cellCenterInches,
  findSeedlingsInRect,
  hitTestCellInches,
} from './seedStartingHitTest';
import type { Seedling } from '../model/seedStarting';

const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });

describe('hitTestCellInches', () => {
  const off = trayInteriorOffsetIn(tray);
  const p = tray.cellPitchIn;

  it('hits cell (0,0) near the grid origin', () => {
    expect(hitTestCellInches(tray, off.x + 0.1, off.y + 0.1)).toEqual({ row: 0, col: 0 });
  });

  it('hits cell (1,2)', () => {
    expect(hitTestCellInches(tray, off.x + 2 * p + 0.1, off.y + 1 * p + 0.1))
      .toEqual({ row: 1, col: 2 });
  });

  it('returns null outside the grid', () => {
    expect(hitTestCellInches(tray, -1, -1)).toBeNull();
  });
});

describe('cellCenterInches', () => {
  it('returns the center of the cell in tray-local inches', () => {
    const off = trayInteriorOffsetIn(tray);
    const p = tray.cellPitchIn;
    expect(cellCenterInches(tray, 1, 2)).toEqual({
      x: off.x + 2.5 * p,
      y: off.y + 1.5 * p,
    });
  });
});

describe('findSeedlingsInRect', () => {
  const mk = (id: string, row: number, col: number): Seedling => ({
    id,
    cultivarId: 'c',
    trayId: tray.id,
    row,
    col,
    labelOverride: null,
  });
  const seedlings = [mk('a', 0, 0), mk('b', 0, 1), mk('c', 1, 2)];

  it('returns ids whose cell centers fall inside the rect', () => {
    const off = trayInteriorOffsetIn(tray);
    const p = tray.cellPitchIn;
    const rect = { x: off.x, y: off.y, width: 2 * p, height: p };
    expect(findSeedlingsInRect([tray], seedlings, rect).sort()).toEqual(['a', 'b']);
  });

  it('handles negative width/height (reversed drag)', () => {
    const off = trayInteriorOffsetIn(tray);
    const p = tray.cellPitchIn;
    const rect = { x: off.x + 2 * p, y: off.y + p, width: -2 * p, height: -p };
    expect(findSeedlingsInRect([tray], seedlings, rect).sort()).toEqual(['a', 'b']);
  });

  it('returns empty when no centers are inside', () => {
    expect(findSeedlingsInRect([tray], seedlings, { x: -10, y: -10, width: 1, height: 1 }))
      .toEqual([]);
  });

  it('skips seedlings without tray placement', () => {
    const orphan: Seedling = { id: 'x', cultivarId: 'c', trayId: null, row: null, col: null, labelOverride: null };
    expect(findSeedlingsInRect([tray], [orphan], { x: -1000, y: -1000, width: 9999, height: 9999 }))
      .toEqual([]);
  });
});
