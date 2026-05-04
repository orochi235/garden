import { useMemo } from 'react';
import { defineTool, type Tool } from '@orochi235/weasel';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { hitTestCellInches } from '../seedStartingHitTest';

export interface SowScratch { handled: boolean }

/** Click an empty tray cell to sow with the currently dragging cultivar
 *  (`useUiStore.seedDragCultivarId`). Used by the seed-starting Canvas as
 *  a fallback for click-to-sow; the palette-drag-to-sow flow continues to
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
            const cultivarId = useUiStore.getState().seedDragCultivarId;
            if (!cultivarId) return 'pass';
            const ss = useGardenStore.getState().garden.seedStarting;
            for (const tray of ss.trays) {
              const cell = hitTestCellInches(tray, ctx.worldX, ctx.worldY);
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
