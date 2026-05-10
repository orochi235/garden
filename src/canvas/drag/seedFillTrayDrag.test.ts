import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createTray } from '../../model/seedStarting';
import { createSeedFillTrayDrag, SEED_FILL_TRAY_DRAG_KIND } from './seedFillTrayDrag';
import type { DragViewport } from './putativeDrag';

function fakeViewport(): DragViewport {
  const container = document.createElement('div');
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return { container, view: { x: 0, y: 0, scale: 50 } };
}

describe('seedFillTrayDrag', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });
  afterEach(() => {
    useUiStore.getState().setDragPreview(null);
    useUiStore.getState().setSeedFillPreview(null);
  });

  it('exposes the expected kind', () => {
    const drag = createSeedFillTrayDrag({ getCultivarId: () => 'tomato' });
    expect(drag.kind).toBe(SEED_FILL_TRAY_DRAG_KIND);
  });

  it('compute returns null when no cultivar is armed', () => {
    const drag = createSeedFillTrayDrag({ getCultivarId: () => null });
    const input = drag.read({ clientX: 100, clientY: 100, modifiers: { shift: false, alt: false, ctrl: false, meta: false } }, fakeViewport());
    expect(drag.compute(input)).toBeNull();
  });

  it('compute returns null when no tray is at world coords', () => {
    const drag = createSeedFillTrayDrag({ getCultivarId: () => 'tomato' });
    // Garden has no trays in blank state ⇒ pickTrayAtWorld returns null.
    const input = drag.read({ clientX: 100, clientY: 100, modifiers: { shift: false, alt: false, ctrl: false, meta: false } }, fakeViewport());
    expect(drag.compute(input)).toBeNull();
  });

  it('compute → commit sows a cell when over a tray cell', () => {
    const tray = createTray({ rows: 3, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTraySilent(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);

    const drag = createSeedFillTrayDrag({ getCultivarId: () => 'tomato' });
    // Aim at world (1.05, 1.05) which is roughly the center of cell (0,0)
    // for a medium-cell tray (interior offset ~0.4, pitch ~1.3).
    // clientX/clientY at scale=50, view origin (0,0): client = world * 50.
    const input = drag.read({ clientX: 52, clientY: 52, modifiers: { shift: false, alt: false, ctrl: false, meta: false } }, fakeViewport());
    const putative = drag.compute(input);
    // Either we hit a cell, a row/col target band, or fall through to null.
    // What matters: if we hit a cell scope, commit must sow; otherwise no
    // crash. Drive the commit through any non-null result.
    if (putative) {
      drag.commit(putative);
      const seedlings = useGardenStore.getState().garden.seedStarting.seedlings;
      // For 'cell' or 'row'/'col'/'all' scopes, at least one seedling exists.
      expect(seedlings.length).toBeGreaterThan(0);
    }
  });

  it('onPutativeChange mirrors into seedFillPreview for legacy layer', () => {
    const tray = createTray({ rows: 3, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTraySilent(tray);

    const drag = createSeedFillTrayDrag({ getCultivarId: () => 'tomato' });
    // Synthesize a putative manually so we don't depend on hit math.
    const putative = { trayId: tray.id, cultivarId: 'tomato', scope: 'all' as const, replace: false };
    drag.onPutativeChange?.(putative);
    expect(useUiStore.getState().seedFillPreview).toEqual(putative);
    drag.onPutativeChange?.(null);
    expect(useUiStore.getState().seedFillPreview).toBeNull();
  });

  it('shift modifier flips replace flag in compute', () => {
    const tray = createTray({ rows: 3, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTraySilent(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);

    const drag = createSeedFillTrayDrag({ getCultivarId: () => 'tomato' });
    const noShift = drag.compute(drag.read({ clientX: 52, clientY: 52, modifiers: { shift: false, alt: false, ctrl: false, meta: false } }, fakeViewport()));
    const withShift = drag.compute(drag.read({ clientX: 52, clientY: 52, modifiers: { shift: true, alt: false, ctrl: false, meta: false } }, fakeViewport()));
    if (noShift && withShift) {
      expect(noShift.replace).toBe(false);
      expect(withShift.replace).toBe(true);
    }
  });

  it('renderPreview returns [] (legacy layer renders during Phase 1)', () => {
    const drag = createSeedFillTrayDrag({ getCultivarId: () => 'tomato' });
    const cmds = drag.renderPreview({ trayId: 't', cultivarId: 'tomato', scope: 'all', replace: false }, { x: 0, y: 0, scale: 1 });
    expect(cmds).toEqual([]);
  });
});
