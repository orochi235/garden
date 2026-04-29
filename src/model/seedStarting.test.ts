import { describe, expect, it } from 'vitest';
import {
  createTray,
  createSeedling,
  emptySeedStartingState,
  getCell,
  setCell,
} from './seedStarting';

describe('seedStarting types', () => {
  it('createTray builds a tray with rows*cols empty slots', () => {
    const tray = createTray({ rows: 6, cols: 6, cellSize: 'medium', label: '36-cell' });
    expect(tray.rows).toBe(6);
    expect(tray.cols).toBe(6);
    expect(tray.slots).toHaveLength(36);
    expect(tray.slots.every((s) => s.state === 'empty')).toBe(true);
  });

  it('cell address is row*cols + col', () => {
    const tray = createTray({ rows: 3, cols: 4, cellSize: 'medium', label: 't' });
    const slot = getCell(tray, 2, 1);
    expect(slot).toBeDefined();
    expect(tray.slots.indexOf(slot!)).toBe(2 * 4 + 1);
  });

  it('setCell replaces a slot in place', () => {
    const tray = createTray({ rows: 2, cols: 2, cellSize: 'small', label: 't' });
    const seedling = createSeedling({ cultivarId: 'basil-genovese' });
    const updated = setCell(tray, 0, 1, { state: 'sown', seedlingId: seedling.id });
    expect(getCell(updated, 0, 1)?.state).toBe('sown');
    expect(getCell(updated, 0, 0)?.state).toBe('empty');
  });

  it('emptySeedStartingState has empty trays and seedlings', () => {
    const s = emptySeedStartingState();
    expect(s.trays).toEqual([]);
    expect(s.seedlings).toEqual([]);
  });
});
