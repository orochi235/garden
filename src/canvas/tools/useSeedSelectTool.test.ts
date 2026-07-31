import { beforeEach, describe, expect, it } from 'vitest';
import { createTray, trayInteriorOffsetIn } from '../../model/nursery';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { AREA_SELECT_DRAG_KIND } from '../drag/areaSelectDrag';
import type { GesturePoint } from './nurseryGestures';
import { createSeedClickGesture, seedMarqueeGesture } from './useSeedSelectTool';

function at(worldX: number, worldY: number, shift = false): GesturePoint {
  return { worldX, worldY, shift, alt: false };
}

describe('seedMarqueeGesture', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('claims a press on empty tray background', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);

    expect(seedMarqueeGesture.start(at(-100, -100))).not.toBeNull();
  });

  it('declines a press on a seedling so the move gesture takes it', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');

    const off = trayInteriorOffsetIn(tray);
    const cellCx = off.x + 0.5 * tray.cellPitchIn;
    const cellCy = off.y + 0.5 * tray.cellPitchIn;
    expect(seedMarqueeGesture.start(at(cellCx, cellCy))).toBeNull();
  });

  it('declines while a palette drag-to-sow is in flight', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setSeedDragCultivarId('basil');

    expect(seedMarqueeGesture.start(at(-100, -100))).toBeNull();
  });

  it('draws a marquee then selects intersected seedlings on release', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');
    useGardenStore.getState().sowCell(tray.id, 0, 1, 'tomato');
    useGardenStore.getState().sowCell(tray.id, 1, 2, 'tomato');
    const ss = useGardenStore.getState().garden.nursery;

    // Start outside the tray, sweep across just the first row.
    const off = trayInteriorOffsetIn(tray);
    const handle = seedMarqueeGesture.start(at(-1, -1));
    expect(handle).not.toBeNull();

    const move = at(off.x + 1.5 * tray.cellPitchIn, off.y + 0.5 * tray.cellPitchIn);
    handle?.move(move);
    // The dragPreview slot mirrors the marquee while it is in flight.
    expect(useUiStore.getState().dragPreview?.kind).toBe(AREA_SELECT_DRAG_KIND);

    handle?.end(move);
    const selected = useUiStore.getState().selectedIds;
    const row0 = ss.seedlings.filter((s) => s.row === 0).map((s) => s.id);
    expect(selected.sort()).toEqual(row0.sort());
    expect(useUiStore.getState().dragPreview).toBeNull();
  });

  it('shift-drag adds to the existing selection rather than replacing it', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');
    useGardenStore.getState().sowCell(tray.id, 1, 2, 'tomato');
    const ss = useGardenStore.getState().garden.nursery;
    const [s0, s1] = ss.seedlings;
    useUiStore.getState().setSelection([s1.id]);

    const off = trayInteriorOffsetIn(tray);
    const handle = seedMarqueeGesture.start(at(-1, -1, true));
    const move = at(off.x + 0.5 * tray.cellPitchIn, off.y + 0.5 * tray.cellPitchIn, true);
    handle?.move(move);
    handle?.end(move);
    expect(useUiStore.getState().selectedIds.sort()).toEqual([s0.id, s1.id].sort());
  });

  it('cancel clears the marquee without touching the selection', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');
    const sId = useGardenStore.getState().garden.nursery.seedlings[0].id;
    useUiStore.getState().setSelection([sId]);

    const off = trayInteriorOffsetIn(tray);
    const handle = seedMarqueeGesture.start(at(-1, -1));
    handle?.move(at(off.x + 1.5 * tray.cellPitchIn, off.y + 0.5 * tray.cellPitchIn));
    handle?.cancel();
    expect(useUiStore.getState().dragPreview).toBeNull();
    expect(useUiStore.getState().selectedIds).toEqual([sId]);
  });
});

describe('seed click gesture', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('click-on-empty clears the selection', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');
    const sId = useGardenStore.getState().garden.nursery.seedlings[0].id;
    useUiStore.getState().setSelection([sId]);

    const gesture = createSeedClickGesture();
    expect(gesture.click(at(-100, -100))).toBe(true);
    expect(useUiStore.getState().selectedIds).toEqual([]);
  });

  it('shift-click on empty leaves the selection alone', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');
    const sId = useGardenStore.getState().garden.nursery.seedlings[0].id;
    useUiStore.getState().setSelection([sId]);

    createSeedClickGesture().click(at(-100, -100, true));
    expect(useUiStore.getState().selectedIds).toEqual([sId]);
  });

  it('click-on-seedling falls through (the move gesture settled selection on press)', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');

    const off = trayInteriorOffsetIn(tray);
    const gesture = createSeedClickGesture();
    const hit = gesture.click(at(off.x + 0.5 * tray.cellPitchIn, off.y + 0.5 * tray.cellPitchIn));
    expect(hit).toBe(false);
  });
});
