import { useMemo } from 'react';
import { defineTool, type Tool } from '@orochi235/weasel';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { hitTestCellInches } from '../nurseryHitTest';
import { trayWorldOrigin } from '../adapters/nurseryScene';
import {
  getTrayDropTargets,
  hitTrayDropTarget,
} from '../layouts/trayDropTargets';
import {
  SEED_FILL_TRAY_DRAG_KIND,
  type SeedFillPutative,
} from '../drag/seedFillTrayDrag';

export interface FillTrayScratch {
  active: boolean;
  trayId: string | null;
  cultivarId: string | null;
  putative: SeedFillPutative | null;
}

/** Shift-drag inside a tray to paint cells with the current dragging cultivar
 *  (`useUiStore.seedDragCultivarId`). Publishes the live putative to
 *  `uiStore.dragPreview` under `SEED_FILL_TRAY_DRAG_KIND` so the framework's
 *  `dragPreviewLayer` renders the ghost; commits on `drag.onEnd`. */
export function useFillTrayTool(): Tool<FillTrayScratch> {
  return useMemo(
    () =>
      defineTool<FillTrayScratch>({
        id: 'seedling-fill',
        cursor: 'crosshair',
        initScratch: () => ({ active: false, trayId: null, cultivarId: null, putative: null }),

        pointer: {
          onDown: (e, ctx) => {
            if (e.button !== 0 || !ctx.modifiers.shift) return 'pass';
            const cultivarId = useUiStore.getState().seedDragCultivarId;
            if (!cultivarId) return 'pass';
            const ss = useGardenStore.getState().garden.nursery;
            for (const tray of ss.trays) {
              const o = trayWorldOrigin(tray, ss);
              const cell = hitTestCellInches(tray, ctx.worldX - o.x, ctx.worldY - o.y);
              if (!cell) continue;
              ctx.scratch.active = true;
              ctx.scratch.trayId = tray.id;
              ctx.scratch.cultivarId = cultivarId;
              return 'claim';
            }
            return 'pass';
          },
        },

        drag: {
          onStart: (_e, ctx) => (ctx.scratch.active ? 'claim' : 'pass'),
          onMove: (_e, ctx) => {
            if (!ctx.scratch.active || !ctx.scratch.trayId || !ctx.scratch.cultivarId) return 'pass';
            const tray = useGardenStore.getState().garden.nursery.trays.find(
              (t) => t.id === ctx.scratch.trayId,
            );
            if (!tray) return 'claim';
            const hit = hitTrayDropTarget(getTrayDropTargets(tray), { x: ctx.worldX, y: ctx.worldY });
            if (!hit) {
              ctx.scratch.putative = null;
              useUiStore.getState().setDragPreview(null);
              return 'claim';
            }
            const m = hit.meta;
            const base = { trayId: tray.id, cultivarId: ctx.scratch.cultivarId, replace: true };
            const putative: SeedFillPutative =
              m.kind === 'all'
                ? { ...base, scope: 'all' }
                : m.kind === 'row'
                  ? { ...base, scope: 'row', index: m.row }
                  : m.kind === 'col'
                    ? { ...base, scope: 'col', index: m.col }
                    : { ...base, scope: 'cell', row: m.row, col: m.col };
            ctx.scratch.putative = putative;
            useUiStore.getState().setDragPreview({ kind: SEED_FILL_TRAY_DRAG_KIND, putative });
            return 'claim';
          },
          onEnd: (_e, ctx) => {
            if (!ctx.scratch.active) return 'pass';
            const putative = ctx.scratch.putative;
            useUiStore.getState().setDragPreview(null);
            ctx.scratch.active = false;
            ctx.scratch.putative = null;
            if (!putative) return 'claim';
            const gs = useGardenStore.getState();
            const replace = putative.replace ?? true;
            switch (putative.scope) {
              case 'all':
                gs.fillTray(putative.trayId, putative.cultivarId, { replace });
                break;
              case 'row':
                gs.fillRow(putative.trayId, putative.index, putative.cultivarId, { replace });
                break;
              case 'col':
                gs.fillColumn(putative.trayId, putative.index, putative.cultivarId, { replace });
                break;
              case 'cell':
                gs.sowCell(putative.trayId, putative.row, putative.col, putative.cultivarId, { replace });
                break;
            }
            return 'claim';
          },
          onCancel: (ctx) => {
            useUiStore.getState().setDragPreview(null);
            ctx.scratch.active = false;
            ctx.scratch.putative = null;
          },
        },
      }),
    [],
  );
}
