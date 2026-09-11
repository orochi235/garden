import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { trayWorldOrigin } from '../adapters/nurseryScene';
import { SEED_FILL_TRAY_DRAG_KIND, type SeedFillPutative } from '../drag/seedFillTrayDrag';
import { getTrayDropTargets, hitTrayDropTarget } from '../layouts/trayDropTargets';
import { hitTestCellInches } from '../nurseryHitTest';
import type { GesturePoint, NurseryDragGesture, NurseryDragHandle } from './nurseryGestures';

/**
 * Shift-drag inside a tray to paint cells with the currently dragging cultivar
 * (`useUiStore.seedDragCultivarId`). Publishes the live putative to
 * `uiStore.dragPreview` under `SEED_FILL_TRAY_DRAG_KIND` so the framework's
 * `dragPreviewLayer` renders the ghost; commits on release.
 *
 * Claims only a shift-press on a cell of some tray while a cultivar is in
 * hand — otherwise it declines and the router offers the drag to the next
 * gesture (seedling move, then marquee).
 */
export const fillTrayGesture: NurseryDragGesture = {
  id: 'seedling-fill',
  start(p: GesturePoint): NurseryDragHandle | null {
    if (!p.shift) return null;
    const cultivarId = useUiStore.getState().seedDragCultivarId;
    if (!cultivarId) return null;
    const ss = useGardenStore.getState().garden.nursery;
    const hitTray = ss.trays.find((tray) => {
      const o = trayWorldOrigin(tray, ss);
      return hitTestCellInches(tray, p.worldX - o.x, p.worldY - o.y) != null;
    });
    if (!hitTray) return null;

    const trayId = hitTray.id;
    let putative: SeedFillPutative | null = null;

    const clearGhost = () => {
      putative = null;
      useUiStore.getState().setDragPreview(null);
    };

    return {
      move(m: GesturePoint) {
        const tray = useGardenStore.getState().garden.nursery.trays.find((t) => t.id === trayId);
        if (!tray) return;
        const hit = hitTrayDropTarget(getTrayDropTargets(tray), { x: m.worldX, y: m.worldY });
        if (!hit) {
          clearGhost();
          return;
        }
        const meta = hit.meta;
        const base = { trayId: tray.id, cultivarId, replace: true };
        putative =
          meta.kind === 'all'
            ? { ...base, scope: 'all' }
            : meta.kind === 'row'
              ? { ...base, scope: 'row', index: meta.row }
              : meta.kind === 'col'
                ? { ...base, scope: 'col', index: meta.col }
                : { ...base, scope: 'cell', row: meta.row, col: meta.col };
        useUiStore.getState().setDragPreview({ kind: SEED_FILL_TRAY_DRAG_KIND, putative });
      },
      end() {
        const committed = putative;
        clearGhost();
        if (!committed) return;
        const gs = useGardenStore.getState();
        const replace = committed.replace ?? true;
        switch (committed.scope) {
          case 'all':
            gs.fillTray(committed.trayId, committed.cultivarId, { replace });
            break;
          case 'row':
            gs.fillRow(committed.trayId, committed.index, committed.cultivarId, { replace });
            break;
          case 'col':
            gs.fillColumn(committed.trayId, committed.index, committed.cultivarId, { replace });
            break;
          case 'cell':
            gs.sowCell(committed.trayId, committed.row, committed.col, committed.cultivarId, {
              replace,
            });
            break;
        }
      },
      cancel() {
        clearGhost();
      },
    };
  },
};
