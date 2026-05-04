import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../store/uiStore';
import { cycleLayerDownAction, cycleLayerUpAction } from './cycleLayer';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, cut: () => {}, paste: () => {}, isEmpty: () => true } };

describe('cycleLayerDownAction', () => {
  beforeEach(() => { useUiStore.getState().reset(); });

  it('cycles down from structures to zones', () => {
    useUiStore.getState().setActiveLayer('structures');
    cycleLayerDownAction.execute(ctx);
    expect(useUiStore.getState().activeLayer).toBe('zones');
  });

  it('skips hidden layers', () => {
    useUiStore.getState().setActiveLayer('structures');
    useUiStore.getState().setLayerVisible('zones', false);
    cycleLayerDownAction.execute(ctx);
    expect(useUiStore.getState().activeLayer).toBe('plantings');
  });
});

describe('cycleLayerUpAction', () => {
  beforeEach(() => { useUiStore.getState().reset(); });

  it('cycles up from zones to structures', () => {
    useUiStore.getState().setActiveLayer('zones');
    cycleLayerUpAction.execute(ctx);
    expect(useUiStore.getState().activeLayer).toBe('structures');
  });
});
