import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { PaletteEntry } from '../../components/palette/paletteData';
import { useGardenPaletteDropTool } from './useGardenPaletteDropTool';

/**
 * The garden palette drop tool watches `useUiStore.palettePointerPayload` and
 * runs its own document-level pointer pipeline. It reads
 * `useUiStore.zoom`/`panX`/`panY` directly (the minimal-scope refactor; full
 * view ownership migration is deferred). Tests assert the public contract:
 * arms a payload, commits via `useGardenStore` add* on release, cleans up
 * the payload on cancel/commit.
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
    value: () => ({
      left: rect.left, top: rect.top,
      right: rect.left + rect.width, bottom: rect.top + rect.height,
      width: rect.width, height: rect.height,
      x: rect.left, y: rect.top, toJSON: () => ({}),
    }),
  });
  document.body.appendChild(el);
  return el;
}

function setupHook(container: HTMLDivElement) {
  return renderHook(() => {
    const containerRef = useRef<HTMLDivElement | null>(container);
    useGardenPaletteDropTool({ containerRef });
    return { containerRef };
  });
}

const structureEntry: PaletteEntry = {
  id: 'raised-bed',
  name: 'Raised Bed',
  category: 'structures',
  type: 'raised-bed',
  defaultWidth: 4,
  defaultLength: 4,
  color: '#8b5a2b',
};

const zoneEntry: PaletteEntry = {
  id: 'soil',
  name: 'Soil',
  category: 'zones',
  type: 'soil',
  defaultWidth: 4,
  defaultLength: 4,
  color: '#5a3d2b',
};

describe('useGardenPaletteDropTool', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
    useUiStore.getState().setAppMode('garden');
    // Use a stable known view: 30 px/ft, no pan.
    useUiStore.getState().setZoom(30);
    useUiStore.getState().setPan(0, 0);
    container = makeContainer({ left: 0, top: 0, width: 800, height: 600 });
  });

  afterEach(() => {
    container.remove();
    useUiStore.getState().setPalettePointerPayload(null);
    useUiStore.getState().clearDragOverlay();
  });

  it('does nothing while no palette payload is armed', () => {
    setupHook(container);
    dispatchPointer('pointermove', { clientX: 100, clientY: 100 });
    dispatchPointer('pointerup', { clientX: 100, clientY: 100 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
    expect(useGardenStore.getState().garden.zones).toHaveLength(0);
  });

  it('does not run when appMode is seed-starting (defers to seed tool)', () => {
    setupHook(container);
    useUiStore.getState().setAppMode('seed-starting');
    const pe = new Event('pointerdown') as PointerEvent;
    Object.assign(pe, { clientX: 100, clientY: 100, pointerId: 1, shiftKey: false });
    useUiStore.getState().setPalettePointerPayload({ entry: structureEntry, pointerEvent: pe });
    dispatchPointer('pointermove', { clientX: 200, clientY: 200 });
    dispatchPointer('pointerup', { clientX: 200, clientY: 200 });
    // Garden tool should not have committed anything.
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('commits a structure on release after passing the activation threshold', () => {
    setupHook(container);
    const pe = new Event('pointerdown') as PointerEvent;
    Object.assign(pe, { clientX: 100, clientY: 100, pointerId: 1, shiftKey: false });
    useUiStore.getState().setPalettePointerPayload({ entry: structureEntry, pointerEvent: pe });

    // Move past threshold to activate.
    dispatchPointer('pointermove', { clientX: 110, clientY: 110 });
    // Release somewhere on the canvas.
    dispatchPointer('pointerup', { clientX: 150, clientY: 150 });

    const structs = useGardenStore.getState().garden.structures;
    expect(structs).toHaveLength(1);
    expect(structs[0].type).toBe('raised-bed');
    expect(useUiStore.getState().palettePointerPayload).toBeNull();
    expect(useUiStore.getState().dragOverlay).toBeNull();
  });

  it('commits a zone on release', () => {
    setupHook(container);
    const pe = new Event('pointerdown') as PointerEvent;
    Object.assign(pe, { clientX: 100, clientY: 100, pointerId: 1, shiftKey: false });
    useUiStore.getState().setPalettePointerPayload({ entry: zoneEntry, pointerEvent: pe });
    dispatchPointer('pointermove', { clientX: 110, clientY: 110 });
    dispatchPointer('pointerup', { clientX: 150, clientY: 150 });

    expect(useGardenStore.getState().garden.zones).toHaveLength(1);
    expect(useUiStore.getState().palettePointerPayload).toBeNull();
  });

  it('clears overlay and payload on cancel without committing', () => {
    setupHook(container);
    const pe = new Event('pointerdown') as PointerEvent;
    Object.assign(pe, { clientX: 100, clientY: 100, pointerId: 1, shiftKey: false });
    useUiStore.getState().setPalettePointerPayload({ entry: structureEntry, pointerEvent: pe });
    dispatchPointer('pointermove', { clientX: 110, clientY: 110 });
    dispatchPointer('pointercancel', { clientX: 110, clientY: 110 });

    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
    expect(useUiStore.getState().palettePointerPayload).toBeNull();
    expect(useUiStore.getState().dragOverlay).toBeNull();
  });

  it('reads zoom/pan from uiStore (regression: minimal-scope refactor)', () => {
    // The garden tool intentionally still reads uiStore zoom/pan rather than a
    // local viewRef. If those fields are ever moved out of the ui store, this
    // test breaks loudly so the migration also updates this tool.
    const ui = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(typeof ui.zoom).toBe('number');
    expect(typeof ui.panX).toBe('number');
    expect(typeof ui.panY).toBe('number');
  });

  it('does not activate without crossing the threshold (sub-threshold up = no commit)', () => {
    setupHook(container);
    const pe = new Event('pointerdown') as PointerEvent;
    Object.assign(pe, { clientX: 100, clientY: 100, pointerId: 1, shiftKey: false });
    useUiStore.getState().setPalettePointerPayload({ entry: structureEntry, pointerEvent: pe });
    // Tiny move (< 4px), then release.
    dispatchPointer('pointermove', { clientX: 101, clientY: 101 });
    dispatchPointer('pointerup', { clientX: 101, clientY: 101 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
    expect(useUiStore.getState().palettePointerPayload).toBeNull();
  });
});
