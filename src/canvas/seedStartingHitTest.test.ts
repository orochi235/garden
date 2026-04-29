import { describe, expect, it } from 'vitest';
import { createTray, trayInteriorOffsetIn } from '../model/seedStarting';
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
const off = trayInteriorOffsetIn(tray);
const gridOx = 100 + off.x * viewport.pxPerInch;
const gridOy = 100 + off.y * viewport.pxPerInch;

describe('hitTestCell', () => {
  it('hits cell (0,0) near top-left', () => {
    const r = hitTestCell(tray, viewport, gridOx + 10, gridOy + 10);
    expect(r).toEqual({ row: 0, col: 0 });
  });

  it('hits cell (1,2) at bottom-right', () => {
    const cellPx = tray.cellPitchIn * viewport.pxPerInch;
    const cx = gridOx + 2 * cellPx + 5;
    const cy = gridOy + 1 * cellPx + 5;
    expect(hitTestCell(tray, viewport, cx, cy)).toEqual({ row: 1, col: 2 });
  });

  it('returns null outside the tray', () => {
    expect(hitTestCell(tray, viewport, 0, 0)).toBeNull();
  });
});

describe('hitTestDragSpreadAffordance', () => {
  const cellPx = tray.cellPitchIn * viewport.pxPerInch;
  const gutter = cellPx * DRAG_SPREAD_GUTTER_RATIO;

  it('returns null inside the grid', () => {
    expect(hitTestDragSpreadAffordance(tray, viewport, gridOx + 10, gridOy + 10)).toBeNull();
  });

  it('hits the corner "all" affordance', () => {
    expect(hitTestDragSpreadAffordance(tray, viewport, gridOx - gutter / 2, gridOy - gutter / 2))
      .toEqual({ kind: 'all' });
  });

  it('hits a column affordance above the grid', () => {
    const cx = gridOx + 1 * cellPx + cellPx / 2;
    const cy = gridOy - gutter / 2;
    expect(hitTestDragSpreadAffordance(tray, viewport, cx, cy)).toEqual({ kind: 'col', col: 1 });
  });

  it('hits a row affordance left of the grid', () => {
    const cx = gridOx - gutter / 2;
    const cy = gridOy + 1 * cellPx + cellPx / 2;
    expect(hitTestDragSpreadAffordance(tray, viewport, cx, cy)).toEqual({ kind: 'row', row: 1 });
  });

  it('returns null further than the gutter from the grid', () => {
    expect(hitTestDragSpreadAffordance(tray, viewport, gridOx - gutter - 5, gridOy - gutter - 5))
      .toBeNull();
  });

  it('returns null past the right edge of the column band', () => {
    const totalW = 3 * cellPx;
    expect(hitTestDragSpreadAffordance(tray, viewport, gridOx + totalW + 5, gridOy - gutter / 2))
      .toBeNull();
  });
});
