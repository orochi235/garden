import { describe, expect, it } from 'vitest';
import { createTray } from '../../model/seedStarting';
import { computeCellRectsIn } from './trayLayers';

describe('computeCellRectsIn', () => {
  it('returns rows*cols rects in inch coordinates', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    const rects = computeCellRectsIn(tray);
    expect(rects).toHaveLength(6);
    expect(rects[0]).toMatchObject({ row: 0, col: 0 });
    expect(rects[5]).toMatchObject({ row: 1, col: 2 });
    // Cell width should equal pitch
    expect(rects[0].widthIn).toBeCloseTo(tray.cellPitchIn);
  });
});
