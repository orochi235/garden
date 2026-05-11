import { describe, expect, it } from 'vitest';
import { createTray, trayInteriorOffsetIn } from '../model/nursery';
import {
  cellCenterInches,
  findSeedlingsInRect,
  hitTestCellAcrossTrays,
  hitTestCellInches,
} from './nurseryHitTest';
import { trayWorldOrigin } from './adapters/nurseryScene';
import type { Seedling, NurseryState } from '../model/nursery';

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

describe('world-coord conversion', () => {
  // Two trays. Second tray's world origin is non-zero (auto-flow column-major
  // layout in `nurseryScene`). All hit-tests must use the world-aware
  // helpers (caller subtracts origin → tray-local) to land on the correct cell.
  const t1 = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 'a' });
  const t2 = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 'b' });
  const ss: NurseryState = { trays: [t1, t2], seedlings: [] };
  const o2 = trayWorldOrigin(t2, ss);

  it('non-zero tray origin: t2 has y > 0 (column-major auto-flow)', () => {
    expect(o2.x).toBe(0);
    expect(o2.y).toBeGreaterThan(0);
  });

  it('hits a cell on t2 at non-zero world origin', () => {
    const off = trayInteriorOffsetIn(t2);
    const p = t2.cellPitchIn;
    const worldX = o2.x + off.x + 1.5 * p; // center col 1
    const worldY = o2.y + off.y + 0.5 * p; // center row 0
    // Caller pattern: subtract trayWorldOrigin before hitTestCellInches.
    const cell = hitTestCellInches(t2, worldX - o2.x, worldY - o2.y);
    expect(cell).toEqual({ row: 0, col: 1 });
  });

  it('cell edge hit on t2 (just inside grid boundary)', () => {
    const off = trayInteriorOffsetIn(t2);
    const worldX = o2.x + off.x + 0.001; // just past origin → col 0
    const worldY = o2.y + off.y + 0.001; // just past origin → row 0
    expect(hitTestCellInches(t2, worldX - o2.x, worldY - o2.y))
      .toEqual({ row: 0, col: 0 });
  });

  it('miss in the gutter between t1 and t2', () => {
    // Gutter sits between t1.heightIn and o2.y in world coords.
    const worldX = 0;
    const worldY = t1.heightIn + 0.5; // inside the inter-tray gutter
    // Try both trays; both should miss.
    expect(hitTestCellInches(t1, worldX, worldY)).toBeNull();
    expect(hitTestCellInches(t2, worldX - o2.x, worldY - o2.y)).toBeNull();
  });

  it('miss far outside any tray in empty world space', () => {
    expect(hitTestCellInches(t1, 9999, 9999)).toBeNull();
    expect(hitTestCellInches(t2, 9999 - o2.x, 9999 - o2.y)).toBeNull();
  });

  it('findSeedlingsInRect with origin fn: rect on t2 selects only t2 seedlings', () => {
    const seedlings: Seedling[] = [
      { id: 's1-on-t1', cultivarId: 'c', trayId: t1.id, row: 0, col: 0, labelOverride: null },
      { id: 's2-on-t2', cultivarId: 'c', trayId: t2.id, row: 0, col: 0, labelOverride: null },
      { id: 's3-on-t2', cultivarId: 'c', trayId: t2.id, row: 1, col: 2, labelOverride: null },
    ];
    // World rect that fully contains t2's grid but not t1's.
    const rect = {
      x: o2.x,
      y: o2.y,
      width: t2.widthIn,
      height: t2.heightIn,
    };
    const ids = findSeedlingsInRect([t1, t2], seedlings, rect, (t) => trayWorldOrigin(t, ss));
    expect(ids.sort()).toEqual(['s2-on-t2', 's3-on-t2']);
  });

  it('hitTestCellAcrossTrays returns t2 when point is on t2', () => {
    const off = trayInteriorOffsetIn(t2);
    const p = t2.cellPitchIn;
    const worldX = o2.x + off.x + 1.5 * p;
    const worldY = o2.y + off.y + 0.5 * p;
    expect(hitTestCellAcrossTrays([t1, t2], worldX, worldY, (t) => trayWorldOrigin(t, ss)))
      .toEqual({ trayId: t2.id, row: 0, col: 1 });
  });

  it('hitTestCellAcrossTrays returns t1 when point is on t1', () => {
    const off = trayInteriorOffsetIn(t1);
    const p = t1.cellPitchIn;
    const worldX = off.x + 0.5 * p;
    const worldY = off.y + 0.5 * p;
    expect(hitTestCellAcrossTrays([t1, t2], worldX, worldY, (t) => trayWorldOrigin(t, ss)))
      .toEqual({ trayId: t1.id, row: 0, col: 0 });
  });

  it('hitTestCellAcrossTrays returns null in inter-tray gutter', () => {
    expect(hitTestCellAcrossTrays([t1, t2], 0, t1.heightIn + 0.5, (t) => trayWorldOrigin(t, ss)))
      .toBeNull();
  });

  it('findSeedlingsInRect without origin fn: legacy single-tray behavior treats all trays at (0,0)', () => {
    // With no origin fn, both trays' cell centers land at the same local
    // coords — confirms the back-compat path is intact.
    const seedlings: Seedling[] = [
      { id: 's1', cultivarId: 'c', trayId: t1.id, row: 0, col: 0, labelOverride: null },
      { id: 's2', cultivarId: 'c', trayId: t2.id, row: 0, col: 0, labelOverride: null },
    ];
    const off = trayInteriorOffsetIn(t1);
    const rect = { x: off.x, y: off.y, width: t1.cellPitchIn, height: t1.cellPitchIn };
    expect(findSeedlingsInRect([t1, t2], seedlings, rect).sort()).toEqual(['s1', 's2']);
  });
});
