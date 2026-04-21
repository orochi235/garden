import { beforeEach, describe, expect, it } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { duplicateAction } from './duplicate';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true }, target: { kind: 'selection' } };

describe('duplicateAction', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('duplicates selected structure with offset', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    duplicateAction.execute(ctx);

    const structures = useGardenStore.getState().garden.structures;
    expect(structures).toHaveLength(2);
    expect(structures[1].x).toBeGreaterThan(0);
  });
});
