import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../store/uiStore';
import { cycleViewModeAction } from './cycleViewMode';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true } };

describe('cycleViewModeAction', () => {
  beforeEach(() => { useUiStore.getState().reset(); });

  it('cycles from select to draw', () => {
    useUiStore.getState().setViewMode('select');
    cycleViewModeAction.execute(ctx);
    expect(useUiStore.getState().viewMode).toBe('draw');
  });

  it('wraps from zoom back to select', () => {
    useUiStore.getState().setViewMode('zoom');
    cycleViewModeAction.execute(ctx);
    expect(useUiStore.getState().viewMode).toBe('select');
  });
});
