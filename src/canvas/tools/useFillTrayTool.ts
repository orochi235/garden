import { useMemo } from 'react';
import { defineTool, type Tool } from '@orochi235/weasel';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { hitTestCellInches } from '../seedStartingHitTest';
import {
  getTrayDropTargets,
  hitTrayDropTarget,
} from '../layouts/trayDropTargets';

export interface FillTrayScratch {
  active: boolean;
  trayId: string | null;
  cultivarId: string | null;
}

/** Shift-drag inside a tray to paint cells with the current dragging cultivar
 *  (`useUiStore.seedDragCultivarId`). Updates `seedFillPreview` while dragging
 *  so the seed-starting fill-preview layer renders the ghost; commits on
 *  drag.onEnd via the appropriate fill action. */
export function useFillTrayTool(): Tool<FillTrayScratch> {
  return useMemo(
    () =>
      defineTool<FillTrayScratch>({
        id: 'seedling-fill',
        modifier: 'shift',
        cursor: 'crosshair',
        initScratch: () => ({ active: false, trayId: null, cultivarId: null }),

        pointer: {
          onDown: (e, ctx) => {
            if (e.button !== 0 || !ctx.modifiers.shift) return 'pass';
            const cultivarId = useUiStore.getState().seedDragCultivarId;
            if (!cultivarId) return 'pass';
            const ss = useGardenStore.getState().garden.seedStarting;
            for (const tray of ss.trays) {
              const cell = hitTestCellInches(tray, ctx.worldX, ctx.worldY);
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
            const tray = useGardenStore.getState().garden.seedStarting.trays.find(
              (t) => t.id === ctx.scratch.trayId,
            );
            if (!tray) return 'claim';
            const hit = hitTrayDropTarget(getTrayDropTargets(tray), { x: ctx.worldX, y: ctx.worldY });
            const base = { trayId: tray.id, cultivarId: ctx.scratch.cultivarId, replace: true };
            if (!hit) {
              useUiStore.getState().setSeedFillPreview(null);
              return 'claim';
            }
            const m = hit.meta;
            useUiStore.getState().setSeedFillPreview(
              m.kind === 'all'
                ? { ...base, scope: 'all' }
                : m.kind === 'row'
                  ? { ...base, scope: 'row', index: m.row }
                  : m.kind === 'col'
                    ? { ...base, scope: 'col', index: m.col }
                    : { ...base, scope: 'cell', row: m.row, col: m.col },
            );
            return 'claim';
          },
          onEnd: (_e, ctx) => {
            if (!ctx.scratch.active) return 'pass';
            const preview = useUiStore.getState().seedFillPreview;
            useUiStore.getState().setSeedFillPreview(null);
            ctx.scratch.active = false;
            if (!preview) return 'claim';
            const gs = useGardenStore.getState();
            const replace = preview.replace ?? true;
            switch (preview.scope) {
              case 'all':
                gs.fillTray(preview.trayId, preview.cultivarId, { replace });
                break;
              case 'row':
                gs.fillRow(preview.trayId, preview.index, preview.cultivarId, { replace });
                break;
              case 'col':
                gs.fillColumn(preview.trayId, preview.index, preview.cultivarId, { replace });
                break;
              case 'cell':
                gs.sowCell(preview.trayId, preview.row, preview.col, preview.cultivarId, { replace });
                break;
            }
            return 'claim';
          },
          onCancel: (ctx) => {
            useUiStore.getState().setSeedFillPreview(null);
            ctx.scratch.active = false;
          },
        },
      }),
    [],
  );
}
