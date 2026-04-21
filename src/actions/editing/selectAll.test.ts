import { beforeEach, describe, expect, it } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { selectAllAction } from './selectAll';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true }, target: { kind: 'none' } };

describe('selectAllAction', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('selectAll selects all objects in active layer', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 5, width: 2, height: 2 });
    useUiStore.getState().setActiveLayer('structures');
    selectAllAction.execute(ctx);
    expect(useUiStore.getState().selectedIds).toHaveLength(2);
  });
});
