import { describe, expect, it } from 'vitest';
import { createTray, trayInteriorOffsetIn } from '../model/seedStarting';
import {
  DRAG_SPREAD_GUTTER_RATIO,
  hitTestCellInches,
  hitTestDragSpreadAffordanceInches,
  cellCenterInches,
} from './seedStartingHitTest';

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

describe('hitTestDragSpreadAffordanceInches', () => {
  const off = trayInteriorOffsetIn(tray);
  const p = tray.cellPitchIn;
  const gutter = p * DRAG_SPREAD_GUTTER_RATIO;

  it('returns null inside the grid', () => {
    expect(hitTestDragSpreadAffordanceInches(tray, off.x + 0.5, off.y + 0.5)).toBeNull();
  });

  it('hits the corner all affordance', () => {
    expect(hitTestDragSpreadAffordanceInches(tray, off.x - gutter / 2, off.y - gutter / 2))
      .toEqual({ kind: 'all' });
  });

  it('hits a column affordance above the grid', () => {
    expect(hitTestDragSpreadAffordanceInches(tray, off.x + 1 * p + p / 2, off.y - gutter / 2))
      .toEqual({ kind: 'col', col: 1 });
  });

  it('hits a row affordance left of the grid', () => {
    expect(hitTestDragSpreadAffordanceInches(tray, off.x - gutter / 2, off.y + 1 * p + p / 2))
      .toEqual({ kind: 'row', row: 1 });
  });

  it('returns null further than the gutter from the grid', () => {
    expect(hitTestDragSpreadAffordanceInches(tray, off.x - gutter - 0.1, off.y - gutter - 0.1))
      .toBeNull();
  });
});
