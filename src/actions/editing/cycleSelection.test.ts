import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { cycleSelectionNextAction, cycleSelectionPrevAction } from './cycleSelection';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true } };

describe('cycleSelection actions', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  it('Tab selects first object when nothing selected', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 5, width: 2, height: 2 });
    useUiStore.getState().setActiveLayer('structures');
    cycleSelectionNextAction.execute(ctx);
    const ids = useUiStore.getState().selectedIds;
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe(useGardenStore.getState().garden.structures[0].id);
  });

  it('Tab advances to next object', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 5, width: 2, height: 2 });
    useUiStore.getState().setActiveLayer('structures');
    const structures = useGardenStore.getState().garden.structures;
    useUiStore.getState().select(structures[0].id);
    cycleSelectionNextAction.execute(ctx);
    expect(useUiStore.getState().selectedIds).toEqual([structures[1].id]);
  });

  it('Shift+Tab goes to previous object', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 5, width: 2, height: 2 });
    useUiStore.getState().setActiveLayer('structures');
    const structures = useGardenStore.getState().garden.structures;
    useUiStore.getState().select(structures[0].id);
    cycleSelectionPrevAction.execute(ctx);
    expect(useUiStore.getState().selectedIds).toEqual([structures[1].id]);
  });

  it('wraps around', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 5, width: 2, height: 2 });
    useUiStore.getState().setActiveLayer('structures');
    const structures = useGardenStore.getState().garden.structures;
    useUiStore.getState().select(structures[1].id);
    cycleSelectionNextAction.execute(ctx);
    expect(useUiStore.getState().selectedIds).toEqual([structures[0].id]);
  });
});
