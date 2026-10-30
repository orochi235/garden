import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../store/uiStore';
import type { ActionContext } from '../types';
import { escapeAction } from './escape';

const ctx: ActionContext = {
  clipboard: { copy: () => {}, cut: () => {}, paste: () => {}, isEmpty: () => true },
  target: { kind: 'none' },
};

describe('escapeAction', () => {
  beforeEach(() => useUiStore.getState().reset());

  it('clears the selection', () => {
    useUiStore.getState().select('a');
    expect(escapeAction.canExecute?.(ctx)).toBe(true);
    escapeAction.execute(ctx);
    expect(useUiStore.getState().selectedIds).toEqual([]);
  });

  it('drops an armed plotting tool before touching the selection', () => {
    useUiStore.getState().select('a');
    useUiStore.getState().setPlottingTool({
      id: 'raised-bed',
      category: 'structures',
      type: 'raised-bed',
      color: '#000',
    });
    escapeAction.execute(ctx);
    expect(useUiStore.getState().plottingTool).toBeNull();
    expect(useUiStore.getState().selectedIds).toEqual(['a']);
  });

  it('passes when there is nothing to drop', () => {
    expect(escapeAction.canExecute?.(ctx)).toBe(false);
  });
});
