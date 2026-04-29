import { describe, expect, it } from 'vitest';
import { createTray } from '../model/seedStarting';
import {
  DRAG_SPREAD_GUTTER_RATIO,
  hitTestDragSpreadAffordance,
  hitTestCell,
  type SeedStartingViewport,
} from './seedStartingHitTest';

const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
const viewport: SeedStartingViewport = {
  pxPerInch: 30,
  originX: 100,
  originY: 100,
};

describe('hitTestCell', () => {
  it('hits cell (0,0) near top-left', () => {
    const r = hitTestCell(tray, viewport, 110, 110);
    expect(r).toEqual({ row: 0, col: 0 });
  });

  it('hits cell (1,2) at bottom-right', () => {
    const cx = 100 + 2 * 1.5 * 30 + 5;
    const cy = 100 + 1 * 1.5 * 30 + 5;
    expect(hitTestCell(tray, viewport, cx, cy)).toEqual({ row: 1, col: 2 });
  });

  it('returns null outside the tray', () => {
    expect(hitTestCell(tray, viewport, 0, 0)).toBeNull();
  });
});

describe('hitTestDragSpreadAffordance', () => {
  // tray: 2 rows x 3 cols, pitch=1.5", ppi=30 → cellPx=45, gutter=45*0.7=31.5
  // grid origin (interior offset 0,0) at (100, 100)
  const cellPx = 1.5 * 30;
  const gutter = cellPx * DRAG_SPREAD_GUTTER_RATIO;

  it('returns null inside the grid', () => {
    expect(hitTestDragSpreadAffordance(tray, viewport, 110, 110)).toBeNull();
  });

  it('hits the corner "all" affordance', () => {
    expect(hitTestDragSpreadAffordance(tray, viewport, 100 - gutter / 2, 100 - gutter / 2))
      .toEqual({ kind: 'all' });
  });

  it('hits a column affordance above the grid', () => {
    const cx = 100 + 1 * cellPx + cellPx / 2;
    const cy = 100 - gutter / 2;
    expect(hitTestDragSpreadAffordance(tray, viewport, cx, cy)).toEqual({ kind: 'col', col: 1 });
  });

  it('hits a row affordance left of the grid', () => {
    const cx = 100 - gutter / 2;
    const cy = 100 + 1 * cellPx + cellPx / 2;
    expect(hitTestDragSpreadAffordance(tray, viewport, cx, cy)).toEqual({ kind: 'row', row: 1 });
  });

  it('returns null further than the gutter from the grid', () => {
    expect(hitTestDragSpreadAffordance(tray, viewport, 100 - gutter - 5, 100 - gutter - 5))
      .toBeNull();
  });

  it('returns null past the right edge of the column band', () => {
    const totalW = 3 * cellPx;
    expect(hitTestDragSpreadAffordance(tray, viewport, 100 + totalW + 5, 100 - gutter / 2))
      .toBeNull();
  });
});
