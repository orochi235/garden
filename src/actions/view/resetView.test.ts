import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '@/store/gardenStore';
import { useUiStore } from '@/store/uiStore';
import { createTray } from '@/model/seedStarting';
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

  it('resets zoom and pan to fit the garden', () => {
    // Mess up the view
    useUiStore.getState().setZoom(5);
    useUiStore.getState().setPan(999, 999);

    resetViewAction.execute(ctx);

    const { zoom, panX, panY } = useUiStore.getState();
    // Default garden is 20x20. At 800x600 with 0.85 padding:
    // zoom = min(800*0.85/20, 600*0.85/20) = min(34, 25.5) = 25.5
    expect(zoom).toBeCloseTo(25.5);
    // Pan centers the garden: (800 - 20*25.5)/2 = (800-510)/2 = 145
    expect(panX).toBeCloseTo(145);
    // (600 - 20*25.5)/2 = (600-510)/2 = 45
    expect(panY).toBeCloseTo(45);
  });

  it('has meta+0 shortcut', () => {
    const shortcut = resetViewAction.shortcut;
    expect(shortcut).toEqual({ key: '0', meta: true });
  });

  it('fits the current tray when in seed-starting mode', () => {
    const tray = createTray({ rows: 6, cols: 4, cellSize: 'medium', label: 't1' });
    useGardenStore.getState().addTraySilent(tray);
    const ui = useUiStore.getState();
    ui.setAppMode('seed-starting');
    ui.setCurrentTrayId(tray.id);
    ui.setSeedStartingZoom(99);
    ui.setSeedStartingPan(123, 456);

    resetViewAction.execute(ctx);

    const after = useUiStore.getState();
    const fitW = (800 * 0.85) / tray.widthIn;
    const fitH = (600 * 0.85) / tray.heightIn;
    expect(after.seedStartingZoom).toBeCloseTo(Math.min(fitW, fitH));
    expect(after.seedStartingPanX).toBe(0);
    expect(after.seedStartingPanY).toBe(0);
    // Garden zoom/pan should be untouched.
    expect(after.zoom).toBe(1);
    expect(after.panX).toBe(0);
    expect(after.panY).toBe(0);
  });
});
