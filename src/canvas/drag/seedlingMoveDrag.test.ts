import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createTray } from '../../model/seedStarting';
import {
  createSeedlingMoveDrag,
  SEEDLING_MOVE_DRAG_KIND,
  type SeedlingMovePutative,
} from './seedlingMoveDrag';


function seedTray(): string {
  const garden = blankGarden();
  const tray = createTray({ rows: 4, cols: 4, cellSize: 'small', label: 'T' });
  garden.seedStarting = { trays: [tray], seedlings: [] };
  useGardenStore.getState().loadGarden(garden);
  return tray.id;
}

describe('seedlingMoveDrag', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });
  afterEach(() => {
    useUiStore.getState().setDragPreview(null);
  });

  it('exposes the expected kind constant', () => {
    const drag = createSeedlingMoveDrag();
    expect(drag.kind).toBe(SEEDLING_MOVE_DRAG_KIND);
    expect(SEEDLING_MOVE_DRAG_KIND).toBe('eric-seedling-move');
  });

  it('compute returns null for empty cells', () => {
    const drag = createSeedlingMoveDrag();
    expect(drag.compute({ trayId: 't', feasible: true, cells: [] })).toBeNull();
  });

  it('compute returns null when trayId is empty', () => {
    const drag = createSeedlingMoveDrag();
    expect(
      drag.compute({
        trayId: '',
        feasible: true,
        cells: [{ row: 0, col: 0, cultivarId: 'tomato', bumped: false }],
      }),
    ).toBeNull();
  });

  it('compute echoes a populated input into a putative', () => {
    const drag = createSeedlingMoveDrag();
    const out = drag.compute({
      trayId: 't1',
      feasible: false,
      cells: [
        { row: 0, col: 0, cultivarId: 'tomato', bumped: false },
        { row: 1, col: 2, cultivarId: 'basil', bumped: true },
      ],
    });
    expect(out).toEqual({
      trayId: 't1',
      feasible: false,
      cells: [
        { row: 0, col: 0, cultivarId: 'tomato', bumped: false },
        { row: 1, col: 2, cultivarId: 'basil', bumped: true },
      ],
    });
  });

  it('renderPreview returns [] when tray is not found', () => {
    const drag = createSeedlingMoveDrag();
    const cmds = drag.renderPreview(
      {
        trayId: 'missing-tray',
        feasible: true,
        cells: [{ row: 0, col: 0, cultivarId: 'tomato', bumped: false }],
      },
      { x: 0, y: 0, scale: 30 },
    );
    expect(cmds).toEqual([]);
  });

  it('renderPreview returns [] for empty cells', () => {
    const trayId = seedTray();
    const drag = createSeedlingMoveDrag();
    const cmds = drag.renderPreview(
      { trayId, feasible: true, cells: [] },
      { x: 0, y: 0, scale: 30 },
    );
    expect(cmds).toEqual([]);
  });

  it('renderPreview emits a group DrawCommand for a feasible move ghost', () => {
    const trayId = seedTray();
    const drag = createSeedlingMoveDrag();
    const putative: SeedlingMovePutative = {
      trayId,
      feasible: true,
      cells: [{ row: 1, col: 2, cultivarId: 'tomato', bumped: false }],
    };
    const cmds = drag.renderPreview(putative, { x: 0, y: 0, scale: 30 });
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds[0].kind).toBe('group');
    // No infeasibility rings emitted for a feasible ghost.
    expect(cmds).toHaveLength(1);
  });

  it('renderPreview emits infeasibility ring commands for every cell when !feasible', () => {
    const trayId = seedTray();
    const drag = createSeedlingMoveDrag();
    const cmds = drag.renderPreview(
      {
        trayId,
        feasible: false,
        cells: [
          { row: 0, col: 0, cultivarId: 'tomato', bumped: false },
          { row: 1, col: 1, cultivarId: 'tomato', bumped: false },
        ],
      },
      { x: 0, y: 0, scale: 30 },
    );
    // ghost group + 2 red infeasibility rings
    expect(cmds).toHaveLength(3);
    expect(cmds[0].kind).toBe('group');
    expect(cmds[1].kind).toBe('path');
    expect(cmds[2].kind).toBe('path');
  });

  it('commit is a no-op (state mutation lives in useSeedlingMoveTool.drag.onEnd)', () => {
    const drag = createSeedlingMoveDrag();
    const beforeGarden = useGardenStore.getState().garden;
    const beforeSel = useUiStore.getState().selectedIds;
    drag.commit({
      trayId: 't',
      feasible: true,
      cells: [{ row: 0, col: 0, cultivarId: 'tomato', bumped: false }],
    });
    expect(useGardenStore.getState().garden).toBe(beforeGarden);
    expect(useUiStore.getState().selectedIds).toBe(beforeSel);
  });

  it('read returns a default-shaped input (controller-unused)', () => {
    const drag = createSeedlingMoveDrag();
    const out = drag.read(
      { clientX: 0, clientY: 0, modifiers: { shift: false, alt: false, ctrl: false, meta: false } },
      { container: document.createElement('div'), view: { x: 0, y: 0, scale: 1 } },
    );
    expect(out).toEqual({ trayId: '', feasible: true, cells: [] });
  });
});
