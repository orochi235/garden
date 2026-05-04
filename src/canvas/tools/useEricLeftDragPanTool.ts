import { useMemo } from 'react';
import { defineTool, type Tool } from '@orochi235/weasel';

export interface LeftDragPanScratch {
  panning: boolean;
  startClient: { x: number; y: number };
  startView: { x: number; y: number };
}

/** Active-tool variant of `useEricRightDragPan`: when the toolbar `viewMode`
 *  is set to 'pan', the LEFT mouse button drags to pan the viewport instead
 *  of selecting. Right-button pan remains available via the always-on tool. */
export function useEricLeftDragPanTool(): Tool<LeftDragPanScratch> {
  return useMemo(
    () =>
      defineTool<LeftDragPanScratch>({
        id: 'eric-left-drag-pan',
        cursor: 'grab',
        initScratch: () => ({
          panning: false,
          startClient: { x: 0, y: 0 },
          startView: { x: 0, y: 0 },
        }),
        pointer: {
          onDown: (e, ctx) => {
            if (e.button !== 0) return 'pass';
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
