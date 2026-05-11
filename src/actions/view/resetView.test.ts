import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '@/store/gardenStore';
import { useUiStore } from '@/store/uiStore';
import { createTray } from '@/model/nursery';
import { resetViewAction } from './resetView';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, cut: () => {}, paste: () => {}, isEmpty: () => true } };

describe('resetViewAction', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();

    // Create a fake canvas container so the action can find it
    container = document.createElement('div');
    container.setAttribute('data-canvas-container', '');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('enqueues a reset request for the garden canvas', () => {
    // Garden mode owns view in canvas-local state; the action posts a
    // {kind:'reset'} request via gardenViewRequest. The canvas's effect
    // reads it, refits its local view, mirrors back to the store, and
    // clears the slot. Here we assert the request is enqueued correctly.
    expect(useUiStore.getState().gardenViewRequest).toBeNull();
    resetViewAction.execute(ctx);
    expect(useUiStore.getState().gardenViewRequest).toEqual({ kind: 'reset' });
  });

  it('has meta+0 shortcut', () => {
    const shortcut = resetViewAction.shortcut;
    expect(shortcut).toEqual({ key: '0', meta: true });
  });

  it('bumps the nursery reset tick in nursery mode', () => {
    const tray = createTray({ rows: 6, cols: 4, cellSize: 'medium', label: 't1' });
    useGardenStore.getState().addTraySilent(tray);
    const ui = useUiStore.getState();
    ui.setAppMode('nursery');
    ui.setCurrentTrayId(tray.id);
    const before = useUiStore.getState().nurseryViewResetTick;

    resetViewAction.execute(ctx);

    const after = useUiStore.getState();
    // Canvas owns its view locally now; reset is a "please refit" signal.
    expect(after.nurseryViewResetTick).toBe(before + 1);
    // Garden mirror untouched in nursery mode; no request enqueued.
    expect(after.gardenZoom).toBe(1);
    expect(after.gardenPanX).toBe(0);
    expect(after.gardenPanY).toBe(0);
    expect(after.gardenViewRequest).toBeNull();
  });
});
