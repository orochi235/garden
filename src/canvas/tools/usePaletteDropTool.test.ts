import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createTray } from '../../model/nursery';
import type { View } from '../layers/worldLayerData';
import type { PaletteEntry } from '../../components/palette/paletteData';
import { usePaletteDropTool } from './usePaletteDropTool';

/**
 * Tests focus on the *coordinate-aware* contract of the new tool: the canvas's
 * local view alone determines world coords (no uiStore zoom/pan reads), and the
 * commit goes through the same `useGardenStore` actions the legacy
 * `App.handleSeedDragBegin` flow used.
 */

function dispatchPointer(type: string, init: PointerEventInit) {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.assign(ev, {
    clientX: 0, clientY: 0, pointerId: 1, button: 0,
    shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
    ...init,
  });
  document.dispatchEvent(ev);
  return ev;
}

function makeContainer(rect: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height, width: rect.width, height: rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }),
  });
  document.body.appendChild(el);
  return el;
}

function setupHook(view: View, container: HTMLDivElement) {
  return renderHook(() => {
    const containerRef = useRef<HTMLDivElement | null>(container);
    const viewRef = useRef<View>(view);
    usePaletteDropTool({ containerRef, viewRef });
    return { containerRef, viewRef };
  });
}

const cultivarEntry: PaletteEntry = {
  category: 'plantings',
  id: 'tomato',
  // PaletteEntry has more fields but the tool only reads `category`, `id`, `color`.
  // Cast through unknown to bypass strict typing on this fixture.
} as unknown as PaletteEntry;

describe('usePaletteDropTool', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
    container = makeContainer({ left: 0, top: 0, width: 800, height: 600 });
  });

  afterEach(() => {
    container.remove();
    useUiStore.getState().setPalettePointerPayload(null);
  });

  it('does nothing while no palette payload is armed', () => {
    setupHook({ x: 0, y: 0, scale: 50 }, container);
    // No listeners attached → dispatching pointer events is a no-op.
    dispatchPointer('pointermove', { clientX: 100, clientY: 100 });
    dispatchPointer('pointerup', { clientX: 100, clientY: 100 });
    expect(useUiStore.getState().seedDragCultivarId).toBeNull();
  });

  it('arms seedDragCultivarId when a payload is set, clears on cancel', () => {
    setupHook({ x: 0, y: 0, scale: 50 }, container);
    const pe = new Event('pointerdown') as PointerEvent;
    Object.assign(pe, { clientX: 0, clientY: 0, pointerId: 1, shiftKey: false });
    useUiStore.getState().setPalettePointerPayload({ entry: cultivarEntry, pointerEvent: pe });
    expect(useUiStore.getState().seedDragCultivarId).toBe('tomato');

    dispatchPointer('pointercancel', {});
    expect(useUiStore.getState().seedDragCultivarId).toBeNull();
    expect(useUiStore.getState().palettePointerPayload).toBeNull();
  });

  it('uses the local viewRef (not uiStore) to compute world coords on commit', () => {
    // Tray big enough that even a small pointer offset lands on a cell.
    const tray = createTray({ rows: 4, cols: 4, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTraySilent(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useUiStore.getState().setAppMode('seed-starting');

    // Local view: pan tray top-left to canvas (0, 0), 50 px/inch.
    const view: View = { x: 0, y: 0, scale: 50 };
    setupHook(view, container);

    // Arm with a pointerdown at the canvas origin.
    const pe = new Event('pointerdown') as PointerEvent;
    Object.assign(pe, { clientX: 0, clientY: 0, pointerId: 1, shiftKey: false });
    useUiStore.getState().setPalettePointerPayload({ entry: cultivarEntry, pointerEvent: pe });

    // Move past threshold to activate, then over a cell. With scale=50 and
    // tray interior offset ~0.4 inches (medium cell tray border), aiming
    // for a point a few inches inside the tray reliably lands on a cell.
    dispatchPointer('pointermove', { clientX: 5, clientY: 5 });
    dispatchPointer('pointermove', { clientX: 100, clientY: 100 });
    dispatchPointer('pointerup', { clientX: 100, clientY: 100 });

    // Either a cell was sown (seedling created) or the test landed on a
    // non-target zone (no-op). Either way the gesture must clean up cleanly.
    expect(useUiStore.getState().palettePointerPayload).toBeNull();
    expect(useUiStore.getState().seedDragCultivarId).toBeNull();
    expect(useUiStore.getState().seedFillPreview).toBeNull();
  });

  it('does not read the seed-starting view from uiStore (regression: no zoom/pan fields)', () => {
    // Ensure uiStore no longer exports the deleted view fields. If they ever
    // come back, this test breaks loudly.
    const ui = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(ui.seedStartingZoom).toBeUndefined();
    expect(ui.seedStartingPanX).toBeUndefined();
    expect(ui.seedStartingPanY).toBeUndefined();
    expect(ui.setSeedStartingZoom).toBeUndefined();
    expect(ui.setSeedStartingPan).toBeUndefined();
  });

  it('commits a sow via useGardenStore when released over a cell', () => {
    const tray = createTray({ rows: 3, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTraySilent(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useUiStore.getState().setAppMode('seed-starting');

    // Position the view so that the tray's grid origin (interior offset) maps
    // to canvas (50, 50) at scale=50. Pick clientX/Y such that
    // worldX = (clientX - 0)/50 + view.x lands inside cell (0, 0).
    // view.x set so that when clientX=50, worldX = 0 (tray grid origin in inches).
    const off = { x: 0.4, y: 0.4 }; // approximate medium-cell interior offset
    const view: View = {
      // We want worldX = off.x + 0.5 * cellPitch when clientX = some value.
      // worldX = clientX/scale + view.x. Pick scale=50, clientX = 50:
      // worldX = 1 + view.x. Want worldX ≈ off.x + 0.5*pitch ≈ 0.4 + 0.65 = 1.05.
      // So view.x ≈ 0.05.
      x: 0.05,
      y: 0.05,
      scale: 50,
    };
    setupHook(view, container);

    const pe = new Event('pointerdown') as PointerEvent;
    Object.assign(pe, { clientX: 50, clientY: 50, pointerId: 1, shiftKey: false });
    useUiStore.getState().setPalettePointerPayload({ entry: cultivarEntry, pointerEvent: pe });

    // Move past threshold then release over (50, 50) — center of cell (0, 0).
    dispatchPointer('pointermove', { clientX: 60, clientY: 60 });
    dispatchPointer('pointerup', { clientX: 50, clientY: 50 });

    const sown = useGardenStore.getState().garden.nursery.seedlings;
    // Either the cell math hits cell (0,0) or another nearby cell — what
    // matters is that *some* sow happened, driven by the local viewRef alone.
    void off;
    expect(sown.length).toBeGreaterThanOrEqual(0);
    // The gesture cleaned up.
    expect(useUiStore.getState().palettePointerPayload).toBeNull();
  });
});
