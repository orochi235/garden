import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { deleteAction } from './delete';
import { createStructure } from '../../model/types';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, cut: () => {}, paste: () => {}, isEmpty: () => true }, target: { kind: 'selection' } };

describe('deleteAction', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  it('delete removes selected objects', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);
    deleteAction.execute(ctx);
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
    expect(useUiStore.getState().selectedIds).toHaveLength(0);
  });

  it('auto-expands to group siblings: deleting one member of a group of 3 deletes all 3', () => {
    const a = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4, groupId: 'g1' });
    const b = createStructure({ type: 'raised-bed', x: 10, y: 0, width: 4, length: 4, groupId: 'g1' });
    const c = createStructure({ type: 'raised-bed', x: 20, y: 0, width: 4, length: 4, groupId: 'g1' });
    const d = createStructure({ type: 'raised-bed', x: 30, y: 0, width: 4, length: 4 });
    useGardenStore.setState((s) => ({ garden: { ...s.garden, structures: [a, b, c, d] } }));

    useUiStore.getState().select(a.id);
    deleteAction.execute(ctx);

    const remaining = useGardenStore.getState().garden.structures;
    expect(remaining.map((s) => s.id)).toEqual([d.id]);
  });

  it('group-expanded delete is a single undo checkpoint', () => {
    const a = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4, groupId: 'g1' });
    const b = createStructure({ type: 'raised-bed', x: 10, y: 0, width: 4, length: 4, groupId: 'g1' });
    const c = createStructure({ type: 'raised-bed', x: 20, y: 0, width: 4, length: 4, groupId: 'g1' });
    useGardenStore.setState((s) => ({ garden: { ...s.garden, structures: [a, b, c] } }));

    useUiStore.getState().select(a.id);
    deleteAction.execute(ctx);
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);

    // One undo restores the entire group.
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures).toHaveLength(3);
  });
});
