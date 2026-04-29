import { describe, expect, it } from 'vitest';
import { createTray } from '../model/seedStarting';
import { hitTestCell, type SeedStartingViewport } from './seedStartingHitTest';

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
