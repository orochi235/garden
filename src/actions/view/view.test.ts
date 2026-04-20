import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../store/uiStore';
import { cycleViewModeAction } from './cycleViewMode';

describe('cycleViewMode action', () => {
  beforeEach(() => { useUiStore.getState().reset(); });

  it('cycles from select to draw', () => {
    useUiStore.getState().setViewMode('select');
    cycleViewModeAction.execute({ clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true } });
    expect(useUiStore.getState().viewMode).toBe('draw');
  });

  it('wraps from zoom back to select', () => {
    useUiStore.getState().setViewMode('zoom');
    cycleViewModeAction.execute({ clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true } });
    expect(useUiStore.getState().viewMode).toBe('select');
  });
});
