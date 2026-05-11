import { useMemo } from 'react';
import { defineTool, type Tool } from '@orochi235/weasel';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { hitTestCellInches } from '../nurseryHitTest';
import { trayWorldOrigin } from '../adapters/nurseryScene';

export interface SowScratch { handled: boolean }

/** Click an empty tray cell to sow with the currently dragging cultivar
 *  (`useUiStore.seedDragCultivarId`) or, as a fallback, the currently armed
 *  cultivar (`useUiStore.armedCultivarId`). Used by the nursery canvas
 *  as a fallback for click-to-sow; the palette-drag-to-sow flow continues to
 *  go through App.tsx's DOM listener. The tool only claims when a cultivar
 *  is currently set so other tools (move, select) take precedence on
 *  populated cells / no-cultivar contexts. */
export function useSowCellTool(): Tool<SowScratch> {
  return useMemo(
    () =>
      defineTool<SowScratch>({
        id: 'seedling-sow',
        cursor: 'crosshair',
        initScratch: () => ({ handled: false }),
        pointer: {
          onClick: (e, ctx) => {
            if (e.button !== 0) return 'pass';
            const ui = useUiStore.getState();
            const cultivarId = ui.seedDragCultivarId ?? ui.armedCultivarId;
            if (!cultivarId) return 'pass';
            const ss = useGardenStore.getState().garden.nursery;
            for (const tray of ss.trays) {
              const o = trayWorldOrigin(tray, ss);
              const cell = hitTestCellInches(tray, ctx.worldX - o.x, ctx.worldY - o.y);
              if (!cell) continue;
              const slot = tray.slots[cell.row * tray.cols + cell.col];
              if (slot.state === 'sown' && !ctx.modifiers.shift) return 'pass';
              useGardenStore.getState().sowCell(tray.id, cell.row, cell.col, cultivarId, {
                replace: ctx.modifiers.shift,
              });
              ctx.scratch.handled = true;
              return 'claim';
            }
            return 'pass';
          },
        },
      }),
    [],
  );
}
