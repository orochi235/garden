import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { trayWorldOrigin } from '../adapters/nurseryScene';
import { hitTestCellInches } from '../nurseryHitTest';
import type { GesturePoint, NurseryClickGesture } from './nurseryGestures';

/**
 * Click an empty tray cell to sow with the currently dragging cultivar
 * (`useUiStore.seedDragCultivarId`) or, as a fallback, the currently armed
 * cultivar (`useUiStore.armedCultivarId`). The nursery canvas uses this as the
 * click-to-sow fallback; the palette-drag-to-sow flow continues to go through
 * App.tsx's DOM listener.
 *
 * Declines (returns `false`) when no cultivar is set, so the click falls
 * through to selection — the same deferral the retired `'pass'` return gave.
 */
export const sowCellGesture: NurseryClickGesture = {
  id: 'seedling-sow',
  click(p: GesturePoint): boolean {
    const ui = useUiStore.getState();
    const cultivarId = ui.seedDragCultivarId ?? ui.armedCultivarId;
    if (!cultivarId) return false;
    const ss = useGardenStore.getState().garden.nursery;
    for (const tray of ss.trays) {
      const o = trayWorldOrigin(tray, ss);
      const cell = hitTestCellInches(tray, p.worldX - o.x, p.worldY - o.y);
      if (!cell) continue;
      const slot = tray.slots[cell.row * tray.cols + cell.col];
      // An occupied cell is only overwritten with shift held.
      if (slot.state === 'sown' && !p.shift) return false;
      useGardenStore
        .getState()
        .sowCell(tray.id, cell.row, cell.col, cultivarId, { replace: p.shift });
      return true;
    }
    return false;
  },
};
