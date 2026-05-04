import { useMemo } from 'react';
import { defineTool, type Tool } from '@orochi235/weasel';

export interface RightDragPanScratch {
  panning: boolean;
  startClient: { x: number; y: number };
  startView: { x: number; y: number };
}

/** Always-on tool: right-mouse-button drag pans the viewport. The kit ships
 *  `useHandTool` for left-button pan, but eric historically uses RMB so the
 *  primary mouse button stays free for select/move. */
export function useEricRightDragPan(): Tool<RightDragPanScratch> {
  return useMemo(
    () =>
      defineTool<RightDragPanScratch>({
        id: 'eric-right-drag-pan',
        cursor: undefined,
        initScratch: () => ({
          panning: false,
          startClient: { x: 0, y: 0 },
          startView: { x: 0, y: 0 },
        }),
        pointer: {
          onDown: (e, ctx) => {
            if (e.button !== 2) return 'pass';
            e.preventDefault();
            ctx.scratch.panning = true;
            ctx.scratch.startClient = { x: e.clientX, y: e.clientY };
            ctx.scratch.startView = { x: ctx.view.x, y: ctx.view.y };
            return 'claim';
          },
        },
        drag: {
          onStart: (_e, ctx) => (ctx.scratch.panning ? 'claim' : 'pass'),
          onMove: (e, ctx) => {
            if (!ctx.scratch.panning) return 'pass';
            const dxScreen = e.clientX - ctx.scratch.startClient.x;
            const dyScreen = e.clientY - ctx.scratch.startClient.y;
            ctx.setView({
              x: ctx.scratch.startView.x - dxScreen / ctx.view.scale,
              y: ctx.scratch.startView.y - dyScreen / ctx.view.scale,
              scale: ctx.view.scale,
            });
            return 'claim';
          },
          onEnd: (_e, ctx) => {
            if (!ctx.scratch.panning) return 'pass';
            ctx.scratch.panning = false;
            return 'claim';
          },
          onCancel: (ctx) => {
            ctx.scratch.panning = false;
          },
        },
      }),
    [],
  );
}
