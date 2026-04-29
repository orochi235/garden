import { describe, expect, it } from 'vitest';
import { createSeedling, createTray, setCell } from '../../model/seedStarting';
import { collectSownCells } from './seedlingLayers';

describe('collectSownCells', () => {
  it('returns one entry per sown cell with its seedling+cultivar', () => {
    let tray = createTray({ rows: 2, cols: 2, cellSize: 'small', label: 't' });
    const seedling = createSeedling({ cultivarId: 'basil-genovese', trayId: tray.id, row: 0, col: 1 });
    tray = setCell(tray, 0, 1, { state: 'sown', seedlingId: seedling.id });
    const result = collectSownCells(tray, [seedling]);
    expect(result).toHaveLength(1);
    expect(result[0].row).toBe(0);
    expect(result[0].col).toBe(1);
    expect(result[0].seedling).toBe(seedling);
  });
});
