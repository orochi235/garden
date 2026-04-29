import { describe, expect, it } from 'vitest';
import { createSeedling, createTray, type CellSize } from './seedStarting';
import { getAllCultivars } from './cultivars';
import { cultivarHasTrayWarning, getSeedlingWarnings, hasSeedlingWarnings } from './seedlingWarnings';

function findCultivarWithCellSize(size: CellSize) {
  return getAllCultivars().find((c) => c.seedStarting.cellSize === size);
}

describe('seedling warnings', () => {
  it('returns no warnings when cultivar prefers the tray cell size', () => {
    const cultivar = findCultivarWithCellSize('medium');
    if (!cultivar) return;
    const tray = createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 't' });
    const seedling = createSeedling({ cultivarId: cultivar.id, trayId: tray.id, row: 0, col: 0 });
    expect(getSeedlingWarnings(seedling, tray)).toEqual([]);
    expect(hasSeedlingWarnings(seedling, tray)).toBe(false);
  });

  it('flags wrong-cell-size when cultivar prefers a different size', () => {
    const cultivar = findCultivarWithCellSize('medium');
    if (!cultivar) return;
    const tray = createTray({ rows: 2, cols: 2, cellSize: 'large', label: 't' });
    const seedling = createSeedling({ cultivarId: cultivar.id, trayId: tray.id, row: 0, col: 0 });
    const warnings = getSeedlingWarnings(seedling, tray);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('wrong-cell-size');
  });

  it('cultivarHasTrayWarning matches the cell-size mismatch rule', () => {
    const cultivar = findCultivarWithCellSize('medium');
    if (!cultivar) return;
    const matchTray = createTray({ rows: 1, cols: 1, cellSize: 'medium', label: 't' });
    const mismatchTray = createTray({ rows: 1, cols: 1, cellSize: 'large', label: 't' });
    expect(cultivarHasTrayWarning(cultivar.id, matchTray)).toBe(false);
    expect(cultivarHasTrayWarning(cultivar.id, mismatchTray)).toBe(true);
    expect(cultivarHasTrayWarning('nonexistent', mismatchTray)).toBe(false);
  });

  it('returns no warnings for unknown cultivar id', () => {
    const tray = createTray({ rows: 1, cols: 1, cellSize: 'small', label: 't' });
    const seedling = createSeedling({ cultivarId: 'nonexistent', trayId: tray.id, row: 0, col: 0 });
    expect(getSeedlingWarnings(seedling, tray)).toEqual([]);
  });
});
