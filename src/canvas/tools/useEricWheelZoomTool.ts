import { useMemo } from 'react';
import { defineTool, zoomAt } from '@orochi235/weasel';
import type { Tool } from '@orochi235/weasel';

export interface EricWheelZoomOpts {
  min?: number;
  max?: number;
  /** Multiplicative step per 100px of wheel delta. Default 1.1. */
  wheelStep?: number;
}

/**
 * Eric's wheel zoom: claims plain wheel events (no ctrl/cmd required) and
 * zooms anchored at the cursor. Matches the legacy bespoke pipeline's UX
 * where mouse wheel = zoom, no modifier needed.
 */
export function useEricWheelZoomTool(opts: EricWheelZoomOpts = {}): Tool<null> {
  // Eric's `zoom` is pixels-per-foot; legacy fit values land around 30–100.
  // Kit's defaults (0.1–8) immediately clamp our high zooms.
  const min = opts.min ?? 5;
  const max = opts.max ?? 500;
  const wheelStep = opts.wheelStep ?? 1.1;
  return useMemo(
    () =>
      defineTool<null>({
        id: 'eric-wheel-zoom',
        initScratch: () => null,
        wheel: {
          onWheel: (e, ctx) => {
            e.preventDefault();
            const rect = ctx.canvasRect;
            const anchor = { x: rect.width / 2, y: rect.height / 2 };
            const factor = Math.pow(wheelStep, -e.deltaY / 100);
            ctx.setView(zoomAt(ctx.view, anchor, factor, { min, max }));
            return 'claim';
          },
        },
      }),
    [min, max, wheelStep],
  );
}
