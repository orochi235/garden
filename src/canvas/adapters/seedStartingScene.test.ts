import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSeedStartingSceneAdapter,
  seedStartingWorldBounds,
  TRAY_GUTTER_IN,
  TRAYS_PER_COLUMN,
  trayWorldOrigin,
} from './seedStartingScene';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createTray, trayInteriorOffsetIn } from '../../model/seedStarting';
import type { Op } from '@orochi235/weasel';

function makeTray() {
  return createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
}

describe('seedStartingSceneAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().setSelection([]);
  });

  function setup() {
    const tray = makeTray();
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil-genovese');
    useGardenStore.getState().sowCell(tray.id, 1, 2, 'basil-genovese');
    const ss = useGardenStore.getState().garden.seedStarting;
    const t = ss.trays[0];
    const sA = ss.seedlings.find((s) => s.row === 0 && s.col === 0)!;
    const sB = ss.seedlings.find((s) => s.row === 1 && s.col === 2)!;
    return { tray: t, sA, sB };
  }

  it('getObjects returns all kinds with discriminators', () => {
    const { tray } = setup();
    const a = createSeedStartingSceneAdapter();
    const objs = a.getObjects();
    expect(objs.filter((o) => o.kind === 'tray').map((o) => o.id)).toEqual([tray.id]);
    expect(objs.filter((o) => o.kind === 'seedling')).toHaveLength(2);
  });

  it('getPose returns raw origin for tray and world-composed for seedling', () => {
    const { tray, sA } = setup();
    const a = createSeedStartingSceneAdapter();
    expect(a.getPose(tray.id)).toEqual({ x: 0, y: 0 });
    const off = trayInteriorOffsetIn(tray);
    expect(a.getPose(sA.id)).toEqual({
      x: off.x + 0.5 * tray.cellPitchIn,
      y: off.y + 0.5 * tray.cellPitchIn,
    });
  });

  it('getParent: seedling → tray id, tray → null', () => {
    const { tray, sA } = setup();
    const a = createSeedStartingSceneAdapter();
    expect(a.getParent(sA.id)).toBe(tray.id);
    expect(a.getParent(tray.id)).toBeNull();
  });

  it('getChildren returns seedling ids in that tray', () => {
    const { tray, sA, sB } = setup();
    const a = createSeedStartingSceneAdapter();
    expect(a.getChildren(tray.id).sort()).toEqual([sA.id, sB.id].sort());
  });

  it('setPose snaps seedling to nearest cell on the tray grid', () => {
    const { tray, sA } = setup();
    const a = createSeedStartingSceneAdapter();
    // Aim for cell (0, 1) — empty.
    const off = trayInteriorOffsetIn(tray);
    const target = {
      x: off.x + 1.5 * tray.cellPitchIn + 0.05,
      y: off.y + 0.5 * tray.cellPitchIn + 0.02,
    };
    a.setPose(sA.id, target);
    const moved = useGardenStore
      .getState()
      .garden.seedStarting.seedlings.find((s) => s.id === sA.id)!;
    expect(moved.row).toBe(0);
    expect(moved.col).toBe(1);
  });

  it('findSnapTarget returns the nearest empty cell of nearest tray', () => {
    const { tray, sA } = setup();
    const a = createSeedStartingSceneAdapter();
    const off = trayInteriorOffsetIn(tray);
    // Drop near cell (1, 1) — empty.
    const t = a.findSnapTarget!(sA.id, off.x + 1.5 * tray.cellPitchIn, off.y + 1.5 * tray.cellPitchIn);
    expect(t).not.toBeNull();
    expect(t!.parentId).toBe(tray.id);
    expect(t!.metadata).toEqual({ row: 1, col: 1 });
    expect(t!.slotPose).toEqual({
      x: off.x + 1.5 * tray.cellPitchIn,
      y: off.y + 1.5 * tray.cellPitchIn,
    });
  });

  it('findSnapTarget returns null for trays', () => {
    const { tray } = setup();
    const a = createSeedStartingSceneAdapter();
    const fn = a.findSnapTarget;
    expect(fn).toBeDefined();
    expect(fn!(tray.id, 1, 1)).toBeNull();
  });

  it('hitTest cascades seedling above tray when overlapping', () => {
    const { tray, sA } = setup();
    const a = createSeedStartingSceneAdapter();
    const off = trayInteriorOffsetIn(tray);
    const cx = off.x + 0.5 * tray.cellPitchIn;
    const cy = off.y + 0.5 * tray.cellPitchIn;
    const top = a.hitTest(cx, cy);
    expect(top?.kind).toBe('seedling');
    expect(top?.id).toBe(sA.id);
    const all = a.hitAll(cx, cy);
    expect(all.map((n) => n.kind)).toEqual(['seedling', 'tray']);
    expect(all[1].id).toBe(tray.id);
  });

  it('hitTest returns tray when hitting an empty cell area', () => {
    const { tray } = setup();
    const a = createSeedStartingSceneAdapter();
    // Inside tray bounds but outside the cell grid (in the padding area).
    const top = a.hitTest(0.05, 0.05);
    expect(top?.kind).toBe('tray');
    expect(top?.id).toBe(tray.id);
  });

  it('applyBatch calls checkpoint once and applies each op', () => {
    setup();
    const a = createSeedStartingSceneAdapter();
    const checkpoint = vi.spyOn(useGardenStore.getState(), 'checkpoint');
    const op1: Op = { apply: vi.fn(), invert: vi.fn() };
    const op2: Op = { apply: vi.fn(), invert: vi.fn() };
    a.applyBatch!([op1, op2], 'test');
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(op1.apply).toHaveBeenCalledWith(a);
    expect(op2.apply).toHaveBeenCalledWith(a);
  });

  describe('trayWorldOrigin / seedStartingWorldBounds (multi-tray auto-flow)', () => {
    function ssWithTrays(trays: { rows: number; cols: number; label: string }[]) {
      // Reset store and add each tray; return the live SeedStarting state.
      useGardenStore.getState().reset();
      useGardenStore.getState().loadGarden(blankGarden());
      for (const t of trays) {
        useGardenStore.getState().addTraySilent(
          createTray({ rows: t.rows, cols: t.cols, cellSize: 'medium', label: t.label }),
        );
      }
      return useGardenStore.getState().garden.seedStarting;
    }

    it('n=1: single tray sits at (0, 0); bounds equal tray dims', () => {
      const ss = ssWithTrays([{ rows: 2, cols: 3, label: 'a' }]);
      expect(trayWorldOrigin(ss.trays[0], ss)).toEqual({ x: 0, y: 0 });
      expect(seedStartingWorldBounds(ss)).toEqual({
        width: ss.trays[0].widthIn,
        height: ss.trays[0].heightIn,
      });
    });

    it('n=2 mixed widths: second tray stacks below the first in the same column; bounds use max width, summed heights + 1 gutter', () => {
      const ss = ssWithTrays([
        { rows: 2, cols: 3, label: 'a' },
        { rows: 4, cols: 6, label: 'b' },
      ]);
      const [t0, t1] = ss.trays;
      expect(trayWorldOrigin(t0, ss)).toEqual({ x: 0, y: 0 });
      expect(trayWorldOrigin(t1, ss)).toEqual({ x: 0, y: t0.heightIn + TRAY_GUTTER_IN });
      expect(seedStartingWorldBounds(ss)).toEqual({
        width: Math.max(t0.widthIn, t1.widthIn),
        height: t0.heightIn + TRAY_GUTTER_IN + t1.heightIn,
      });
    });

    it('n=3 fills first column top-to-bottom (TRAYS_PER_COLUMN=3)', () => {
      const ss = ssWithTrays([
        { rows: 2, cols: 3, label: 'a' },
        { rows: 3, cols: 5, label: 'b' },
        { rows: 4, cols: 2, label: 'c' },
      ]);
      const [t0, t1, t2] = ss.trays;
      expect(trayWorldOrigin(t0, ss)).toEqual({ x: 0, y: 0 });
      expect(trayWorldOrigin(t1, ss)).toEqual({ x: 0, y: t0.heightIn + TRAY_GUTTER_IN });
      expect(trayWorldOrigin(t2, ss)).toEqual({
        x: 0,
        y: t0.heightIn + t1.heightIn + 2 * TRAY_GUTTER_IN,
      });
      expect(seedStartingWorldBounds(ss)).toEqual({
        width: Math.max(t0.widthIn, t1.widthIn, t2.widthIn),
        height: t0.heightIn + t1.heightIn + t2.heightIn + 2 * TRAY_GUTTER_IN,
      });
    });

    it('n=4 wraps to a second column; col0 width is max of its members', () => {
      const ss = ssWithTrays([
        { rows: 2, cols: 3, label: 'a' },
        { rows: 3, cols: 5, label: 'b' },
        { rows: 4, cols: 2, label: 'c' },
        { rows: 2, cols: 4, label: 'd' },
      ]);
      const [t0, t1, t2, t3] = ss.trays;
      const col0Width = Math.max(t0.widthIn, t1.widthIn, t2.widthIn);
      expect(trayWorldOrigin(t3, ss)).toEqual({
        x: col0Width + TRAY_GUTTER_IN,
        y: 0,
      });
      expect(seedStartingWorldBounds(ss)).toEqual({
        width: col0Width + TRAY_GUTTER_IN + t3.widthIn,
        height: t0.heightIn + t1.heightIn + t2.heightIn + 2 * TRAY_GUTTER_IN,
      });
    });

    it('exposes TRAYS_PER_COLUMN as 3', () => {
      expect(TRAYS_PER_COLUMN).toBe(3);
    });

    it('zero trays: bounds are (0, 0)', () => {
      const ss = ssWithTrays([]);
      expect(seedStartingWorldBounds(ss)).toEqual({ width: 0, height: 0 });
    });
  });

  it('selection bridges to useUiStore', () => {
    const { sA } = setup();
    const a = createSeedStartingSceneAdapter();
    a.setSelection([sA.id]);
    expect(a.getSelection()).toEqual([sA.id]);
    expect(useUiStore.getState().selectedIds).toEqual([sA.id]);
  });
});
