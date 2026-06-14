import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTray } from '../../model/nursery';
import { createStructure } from '../../model/types';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { ActionContext } from '../types';
import { deleteAction } from './delete';

const ctx: ActionContext = {
  clipboard: { copy: () => {}, cut: () => {}, paste: () => {}, isEmpty: () => true },
  target: { kind: 'selection' },
};

describe('deleteAction', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  afterEach(() => {
    useUiStore.getState().setAppMode('garden');
  });

  it('delete removes selected objects', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);
    deleteAction.execute(ctx);
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
    expect(useUiStore.getState().selectedIds).toHaveLength(0);
  });

  it('delete removes the structure from the SCENE, not just the Zustand field', () => {
    // Regression: a raw setState({garden}) sets the field but not the
    // scene-backed facade, so a deleted object reappears on the next
    // scene-driven recompose. Delete, then trigger a recompose (another
    // structure add) and confirm the deleted one stays gone.
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);
    deleteAction.execute(ctx);
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);

    // Recompose: a fresh add rebuilds/reads the scene. If delete had bypassed
    // the facade, the deleted structure would resurface here.
    useGardenStore
      .getState()
      .addStructure({ type: 'raised-bed', x: 10, y: 0, width: 4, length: 4 });
    const ids = useGardenStore.getState().garden.structures.map((s) => s.id);
    expect(ids).not.toContain(id);
    expect(ids).toHaveLength(1);
  });

  it('auto-expands to group siblings: deleting one member of a group of 3 deletes all 3', () => {
    const a = createStructure({
      type: 'raised-bed',
      x: 0,
      y: 0,
      width: 4,
      length: 4,
      groupId: 'g1',
    });
    const b = createStructure({
      type: 'raised-bed',
      x: 10,
      y: 0,
      width: 4,
      length: 4,
      groupId: 'g1',
    });
    const c = createStructure({
      type: 'raised-bed',
      x: 20,
      y: 0,
      width: 4,
      length: 4,
      groupId: 'g1',
    });
    const d = createStructure({ type: 'raised-bed', x: 30, y: 0, width: 4, length: 4 });
    useGardenStore.getState().applyGardenPatch({ structures: [a, b, c, d] });

    useUiStore.getState().select(a.id);
    deleteAction.execute(ctx);

    const remaining = useGardenStore.getState().garden.structures;
    expect(remaining.map((s) => s.id)).toEqual([d.id]);
  });

  it('deletes selected seedlings and clears their tray slots', () => {
    useGardenStore
      .getState()
      .addTray(createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' }));
    const trayId = useGardenStore.getState().garden.nursery.trays[0].id;
    useGardenStore.getState().sowCell(trayId, 0, 0, 'basil-genovese');
    useGardenStore.getState().sowCell(trayId, 0, 1, 'basil-genovese');
    const seedlings = useGardenStore.getState().garden.nursery.seedlings;
    const [sA, sB] = seedlings;
    useUiStore.getState().setSelection([sA.id]);
    deleteAction.execute(ctx);
    const ss = useGardenStore.getState().garden.nursery;
    expect(ss.seedlings.map((s) => s.id)).toEqual([sB.id]);
    const slot = ss.trays[0].slots[0]; // row=0, col=0
    expect(slot.state).toBe('empty');
    expect(slot.seedlingId).toBeNull();
  });

  it('seedling delete is a single undo checkpoint', () => {
    // Seedling edits + undo live on the nursery stack, reachable only in nursery mode.
    useUiStore.getState().setAppMode('nursery');
    useGardenStore
      .getState()
      .addTray(createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' }));
    const trayId = useGardenStore.getState().garden.nursery.trays[0].id;
    useGardenStore.getState().sowCell(trayId, 0, 0, 'basil-genovese');
    const sId = useGardenStore.getState().garden.nursery.seedlings[0].id;
    useUiStore.getState().setSelection([sId]);
    deleteAction.execute(ctx);
    expect(useGardenStore.getState().garden.nursery.seedlings).toHaveLength(0);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.nursery.seedlings).toHaveLength(1);
  });

  it('group-expanded delete is a single undo checkpoint', () => {
    const a = createStructure({
      type: 'raised-bed',
      x: 0,
      y: 0,
      width: 4,
      length: 4,
      groupId: 'g1',
    });
    const b = createStructure({
      type: 'raised-bed',
      x: 10,
      y: 0,
      width: 4,
      length: 4,
      groupId: 'g1',
    });
    const c = createStructure({
      type: 'raised-bed',
      x: 20,
      y: 0,
      width: 4,
      length: 4,
      groupId: 'g1',
    });
    useGardenStore.getState().applyGardenPatch({ structures: [a, b, c] });

    useUiStore.getState().select(a.id);
    deleteAction.execute(ctx);
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);

    // One undo restores the entire group.
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures).toHaveLength(3);
  });
});
