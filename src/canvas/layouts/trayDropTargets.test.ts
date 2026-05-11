import { describe, expect, it } from 'vitest';
import { createTray, trayInteriorOffsetIn } from '../../model/nursery';
import {
  DRAG_SPREAD_GUTTER_RATIO,
  getTrayDropTargets,
  hitTrayDropTarget,
} from './trayDropTargets';

const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
const off = trayInteriorOffsetIn(tray);
const p = tray.cellPitchIn;
const gutter = p * DRAG_SPREAD_GUTTER_RATIO;

describe('getTrayDropTargets', () => {
  it('emits cells + row/col/all gutters', () => {
    const targets = getTrayDropTargets(tray);
    const kinds = targets.map((t) => t.meta.kind);
    expect(kinds.filter((k) => k === 'all').length).toBe(1);
    expect(kinds.filter((k) => k === 'row').length).toBe(tray.rows);
    expect(kinds.filter((k) => k === 'col').length).toBe(tray.cols);
    expect(kinds.filter((k) => k === 'cell').length).toBe(tray.rows * tray.cols);
  });

  it('emits the all-corner before edge gutters before cells', () => {
    const kinds = getTrayDropTargets(tray).map((t) => t.meta.kind);
    expect(kinds[0]).toBe('all');
    const firstCell = kinds.indexOf('cell');
    const lastEdge = Math.max(kinds.lastIndexOf('row'), kinds.lastIndexOf('col'));
    expect(lastEdge).toBeLessThan(firstCell);
  });
});

describe('hitTrayDropTarget', () => {
  const targets = getTrayDropTargets(tray);

  it('hits a cell when the point is inside the grid', () => {
    const got = hitTrayDropTarget(targets, { x: off.x + 1.5 * p, y: off.y + 0.5 * p });
    expect(got?.meta).toEqual({ kind: 'cell', row: 0, col: 1 });
  });

  it('hits a column gutter above the grid', () => {
    const got = hitTrayDropTarget(targets, { x: off.x + 1.5 * p, y: off.y - gutter / 2 });
    expect(got?.meta).toEqual({ kind: 'col', col: 1 });
  });

  it('hits a row gutter left of the grid', () => {
    const got = hitTrayDropTarget(targets, { x: off.x - gutter / 2, y: off.y + 0.5 * p });
    expect(got?.meta).toEqual({ kind: 'row', row: 0 });
  });

  it('hits the all-corner above-left of the grid', () => {
    const got = hitTrayDropTarget(targets, { x: off.x - gutter / 2, y: off.y - gutter / 2 });
    expect(got?.meta).toEqual({ kind: 'all' });
  });

  it('returns null when the point is outside everything', () => {
    expect(hitTrayDropTarget(targets, { x: -1000, y: -1000 })).toBeNull();
    expect(hitTrayDropTarget(targets, { x: off.x + tray.cols * p + 1, y: off.y })).toBeNull();
  });
});
