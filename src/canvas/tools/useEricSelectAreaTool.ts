import { type AnyTool, defineTool } from '@orochi235/weasel';
import { useMemo } from 'react';

/**
 * Force-marquee select tool for `viewMode === 'select-area'`.
 *
 * The kit's internal select tool only routes drags on EMPTY space to the
 * `areaSelect` action (body drags become moves). In select-area mode the user
 * wants every drag — including drags that start on an object body — to draw a
 * marquee instead. This tool binds *all* drags to the dispatcher's `areaSelect`
 * action; selection extend/replace is owned by the kit's `areaSelect` dep
 * (shift extends), so no behaviors are needed.
 *
 * Registered as a normal (foreground) tool and made the active slot while
 * select-area mode is on. Clicks (no drag) are handled by the ambient
 * `eric-canvas-click` tool (clear / group-promote), so this tool only owns the
 * drag → marquee binding.
 */
export function useEricSelectAreaTool(): AnyTool {
  return useMemo<AnyTool>(() => {
    const base = defineTool({ id: 'eric-select-area', cursor: 'crosshair' });
    return {
      ...base,
      bindings: [{ spec: { kind: 'drag' as const }, actionId: 'areaSelect' }],
    } as AnyTool;
  }, []);
}
