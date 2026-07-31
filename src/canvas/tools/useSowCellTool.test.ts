import { beforeEach, describe, expect, it } from 'vitest';
import { createTray, trayInteriorOffsetIn } from '../../model/nursery';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { GesturePoint } from './nurseryGestures';
import { sowCellGesture } from './useSowCellTool';

function at(worldX: number, worldY: number, shift = false): GesturePoint {
  return { worldX, worldY, shift, alt: false };
}

describe('sowCellGesture', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('declines when no cultivar is set (neither drag nor armed)', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    const off = trayInteriorOffsetIn(tray);
    expect(sowCellGesture.click(at(off.x + 0.1, off.y + 0.1))).toBe(false);
  });

  it('handles the click and sows when armedCultivarId is set', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setArmedCultivarId('tomato');

    const off = trayInteriorOffsetIn(tray);
    expect(sowCellGesture.click(at(off.x + 0.1, off.y + 0.1))).toBe(true);
    const seedlings = useGardenStore.getState().garden.nursery.seedlings;
    expect(seedlings).toHaveLength(1);
    expect(seedlings[0].cultivarId).toBe('tomato');
    expect(seedlings[0].row).toBe(0);
    expect(seedlings[0].col).toBe(0);
  });

  it('prefers seedDragCultivarId over armedCultivarId when both set', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setSeedDragCultivarId('basil');
    useUiStore.getState().setArmedCultivarId('tomato');

    const off = trayInteriorOffsetIn(tray);
    sowCellGesture.click(at(off.x + 0.1, off.y + 0.1));
    const seedlings = useGardenStore.getState().garden.nursery.seedlings;
    expect(seedlings).toHaveLength(1);
    expect(seedlings[0].cultivarId).toBe('basil');
  });

  it('declines on an occupied cell without shift', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setArmedCultivarId('tomato');
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil');

    const off = trayInteriorOffsetIn(tray);
    expect(sowCellGesture.click(at(off.x + 0.1, off.y + 0.1))).toBe(false);
  });

  it('overwrites an occupied cell with shift held', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setArmedCultivarId('tomato');
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil');

    const off = trayInteriorOffsetIn(tray);
    expect(sowCellGesture.click(at(off.x + 0.1, off.y + 0.1, true))).toBe(true);
    const seedlings = useGardenStore.getState().garden.nursery.seedlings;
    expect(seedlings).toHaveLength(1);
    expect(seedlings[0].cultivarId).toBe('tomato');
  });

  it('does not auto-disarm after a sow', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setArmedCultivarId('tomato');

    const off = trayInteriorOffsetIn(tray);
    sowCellGesture.click(at(off.x + 0.1, off.y + 0.1));
    expect(useUiStore.getState().armedCultivarId).toBe('tomato');
  });
});
