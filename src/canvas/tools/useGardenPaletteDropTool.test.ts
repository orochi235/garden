import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { PaletteEntry } from '../../components/palette/paletteData';
import { useGardenPaletteDropTool } from './useGardenPaletteDropTool';

/**
 * The garden palette drop tool watches `useUiStore.palettePointerPayload` and
 * runs its own document-level pointer pipeline. It reads the canvas-owned
 * view via the `viewRef` injected by `GardenCanvasNewPrototype`. Tests
 * assert the public contract: arms a payload, commits via `useGardenStore`
 * add* on release, cleans up the payload on cancel/commit.
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

// View used across the suite: zoom = 30 px/ft, no pan. Matches the legacy
// uiStore mirror values these tests used to write directly.
const TEST_VIEW = { x: 0, y: 0, scale: 30 };

function setupHook(container: HTMLDivElement) {
  return renderHook(() => {
    const containerRef = useRef<HTMLDivElement | null>(container);
    const viewRef = useRef(TEST_VIEW);
    useGardenPaletteDropTool({ containerRef, viewRef });
    return { containerRef, viewRef };
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

const plantingEntry: PaletteEntry = {
  id: 'tomato',
  name: 'Tomato',
  category: 'plantings',
  type: 'plant',
  defaultWidth: 1,
  defaultLength: 1,
  color: '#e63946',
};

describe('useGardenPaletteDropTool', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
    useUiStore.getState().setAppMode('garden');
    // The view comes from the local viewRef passed to the hook (TEST_VIEW =
    // 30 px/ft, no pan). Mirror it into the store too in case any UI sibling
    // re-reads (no test consumer here, but matches production semantics).
    useUiStore.getState().setGardenViewMirror(30, 0, 0);
    container = makeContainer({ left: 0, top: 0, width: 800, height: 600 });
  });

  afterEach(() => {
    container.remove();
    useUiStore.getState().setPalettePointerPayload(null);
    useUiStore.getState().setDragPreview(null);
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

  it('clears payload on cancel without committing', () => {
    setupHook(container);
    const pe = new Event('pointerdown') as PointerEvent;
    Object.assign(pe, { clientX: 100, clientY: 100, pointerId: 1, shiftKey: false });
    useUiStore.getState().setPalettePointerPayload({ entry: structureEntry, pointerEvent: pe });
    dispatchPointer('pointermove', { clientX: 110, clientY: 110 });
    dispatchPointer('pointercancel', { clientX: 110, clientY: 110 });

    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
    expect(useUiStore.getState().palettePointerPayload).toBeNull();
  });

  it('reads view from the injected viewRef, not uiStore', () => {
    // After the canvas-owned-view migration, garden zoom/panX/panY are no
    // longer on the ui store; only a read-only mirror (`gardenZoom` etc.).
    // The tool must take view from the `viewRef` argument so gestures don't
    // depend on the store. Assert the legacy field names are gone.
    const ui = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(ui.zoom).toBeUndefined();
    expect(ui.panX).toBeUndefined();
    expect(ui.panY).toBeUndefined();
    expect(typeof ui.gardenZoom).toBe('number');
  });

  describe('plantings — putative-drag framework path', () => {
    function addFreeZone() {
      // Add a zone at world (0,0)..(8,8) and force `arrangement: null` so
      // `getPlantingPosition` falls into the cursor-driven branch (different
      // cursor → different snapped position).
      useGardenStore.getState().addZone({
        x: 0,
        y: 0,
        width: 8,
        length: 8,
      });
      const z = useGardenStore.getState().garden.zones[0];
      useGardenStore.getState().updateZone(z.id, { layout: null });
    }

    it('writes dragPreview as the pointer moves and clears it on commit', () => {
      setupHook(container);
      addFreeZone();
      const pe = new Event('pointerdown') as PointerEvent;
      Object.assign(pe, { clientX: 60, clientY: 60, pointerId: 1, shiftKey: false });
      useUiStore.getState().setPalettePointerPayload({ entry: plantingEntry, pointerEvent: pe });

      // Cross the activation threshold over the container.
      dispatchPointer('pointermove', { clientX: 90, clientY: 90 });
      const slotAfterMove = useUiStore.getState().dragPreview;
      expect(slotAfterMove).not.toBeNull();
      expect(slotAfterMove?.kind).toBe('garden-palette-plant');

      // Move to a meaningfully different spot — putative pose updates.
      // (60 px = 2 ft at zoom=30; large enough to land in a different cell.)
      dispatchPointer('pointermove', { clientX: 180, clientY: 180 });
      const slotAfterSecondMove = useUiStore.getState().dragPreview;
      expect(slotAfterSecondMove).not.toBeNull();
      const before = slotAfterMove?.putative as { x: number; y: number };
      const after = slotAfterSecondMove?.putative as { x: number; y: number };
      expect(after.x !== before.x || after.y !== before.y).toBe(true);

      // Release commits a planting and clears the slot.
      dispatchPointer('pointerup', { clientX: 180, clientY: 180 });
      expect(useUiStore.getState().dragPreview).toBeNull();
      const plantings = useGardenStore.getState().garden.plantings;
      expect(plantings).toHaveLength(1);
      expect(plantings[0].cultivarId).toBe('tomato');
      expect(useUiStore.getState().palettePointerPayload).toBeNull();
    });

    it('cancel clears the preview without committing', () => {
      setupHook(container);
      addFreeZone();
      const pe = new Event('pointerdown') as PointerEvent;
      Object.assign(pe, { clientX: 60, clientY: 60, pointerId: 1, shiftKey: false });
      useUiStore.getState().setPalettePointerPayload({ entry: plantingEntry, pointerEvent: pe });
      dispatchPointer('pointermove', { clientX: 90, clientY: 90 });
      expect(useUiStore.getState().dragPreview).not.toBeNull();
      dispatchPointer('pointercancel', { clientX: 90, clientY: 90 });
      expect(useUiStore.getState().dragPreview).toBeNull();
      expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
      expect(useUiStore.getState().palettePointerPayload).toBeNull();
    });

    it('drop outside any container/zone does not commit', () => {
      setupHook(container);
      // No container added.
      const pe = new Event('pointerdown') as PointerEvent;
      Object.assign(pe, { clientX: 60, clientY: 60, pointerId: 1, shiftKey: false });
      useUiStore.getState().setPalettePointerPayload({ entry: plantingEntry, pointerEvent: pe });
      dispatchPointer('pointermove', { clientX: 90, clientY: 90 });
      // No parent under cursor → putative is null.
      expect(useUiStore.getState().dragPreview).toBeNull();
      dispatchPointer('pointerup', { clientX: 90, clientY: 90 });
      expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
    });
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
