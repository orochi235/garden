import { useMemo } from 'react';
import { defineTool, zoomAt } from '@orochi235/weasel';
import type { Tool } from '@orochi235/weasel';

export interface EricClickZoomOpts {
  min?: number;
  max?: number;
  /** Multiplicative factor per click. Default 1.5. Shift inverts to 1/factor. */
  factor?: number;
}

/**
 * Eric's click-to-zoom: active tool for `viewMode === 'zoom'`. Plain
 * left-click zooms in around the click point; Shift+click zooms out.
 * Anchored at the cursor via `zoomAt` so the world point under the
 * cursor stays under the cursor.
 *
 * Modeled after `useEricWheelZoomTool` (same min/max bounds, same
 * cursor-anchored math). Uses the pointer channel so it only activates
 * when the toolbar arms it; wheel-zoom remains always-on regardless.
 */
export function useEricClickZoomTool(opts: EricClickZoomOpts = {}): Tool<null> {
  const min = opts.min ?? 5;
  const max = opts.max ?? 500;
  const factor = opts.factor ?? 1.5;
  return useMemo(
    () =>
      defineTool<null>({
        id: 'eric-click-zoom',
        // Cursor reflects the current shift state. Tools dispatcher re-reads
        // this on every modifier change, so the cursor flips live as the
        // user holds/releases shift.
        cursor: (ctx) => (ctx.modifiers.shift ? 'zoom-out' : 'zoom-in'),
        initScratch: () => null,
        pointer: {
          onDown: (e, ctx) => {
            // Only claim plain left-button presses. Right-button is reserved
            // for the always-on pan tool; middle/aux buttons are ignored.
            if (e.button !== 0) return 'pass';
            e.preventDefault();
            const rect = ctx.canvasRect;
            const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const f = e.shiftKey ? 1 / factor : factor;
            ctx.setView(zoomAt(ctx.view, anchor, f, { min, max }));
            return 'claim';
          },
        },
      }),
    [min, max, factor],
  );
}
