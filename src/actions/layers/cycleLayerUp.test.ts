import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../store/uiStore';
import { cycleLayerUpAction } from './cycleLayer';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true } };

describe('cycleLayerUpAction', () => {
  beforeEach(() => { useUiStore.getState().reset(); });

  it('cycles up from zones to structures', () => {
    useUiStore.getState().setActiveLayer('zones');
    cycleLayerUpAction.execute(ctx);
    expect(useUiStore.getState().activeLayer).toBe('structures');
  });
});
