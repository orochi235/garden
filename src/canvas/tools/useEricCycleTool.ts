import { useMemo, useRef } from 'react';
import { defineTool, type Tool } from '@orochi235/weasel';
import { useUiStore } from '../../store/uiStore';
import type { GardenSceneAdapter } from '../adapters/gardenScene';

export interface CycleScratch { cycled: boolean }

interface CycleMemo {
  worldX: number;
  worldY: number;
  ids: string[];
  /** Index in `ids` of the most recently selected entry. */
  index: number;
}

/** Alt+click cycles through overlapping objects at the cursor. The first
 *  alt-click selects the top-most hit; each subsequent alt-click at the same
 *  spot advances through the stack. Memo resets when the cursor moves to a
 *  different (worldX, worldY) point — the threshold is intentionally tiny
 *  since clicks at "the same spot" are typically pixel-perfect. */
export function useEricCycleTool(adapter: GardenSceneAdapter): Tool<CycleScratch> {
  const memoRef = useRef<CycleMemo | null>(null);

  return useMemo(
    () =>
      defineTool<CycleScratch>({
        id: 'eric-cycle',
        modifier: 'alt',
        initScratch: () => ({ cycled: false }),
        pointer: {
          onDown: (e, ctx) => {
            if (!ctx.modifiers.alt) return 'pass';
            const ids = adapter.hitAll(ctx.worldX, ctx.worldY).map((n) => n.id);
            if (ids.length === 0) return 'pass';
            const memo = memoRef.current;
            const same = memo
              && Math.abs(memo.worldX - ctx.worldX) < 0.001
              && Math.abs(memo.worldY - ctx.worldY) < 0.001
              && memo.ids.length === ids.length
              && memo.ids.every((v, i) => v === ids[i]);
            const nextIndex = same ? (memo!.index + 1) % ids.length : 0;
            memoRef.current = { worldX: ctx.worldX, worldY: ctx.worldY, ids, index: nextIndex };
            useUiStore.getState().setSelection([ids[nextIndex]]);
            ctx.scratch.cycled = true;
            e.preventDefault();
            return 'claim';
          },
        },
        // No drag — alt+drag is reserved for clone in the legacy canvas. Here
        // we only intercept the click; if the user starts dragging, we let it
        // pass to the next tool (which is currently nothing — clone-on-alt-drag
        // is a Phase 5 deferral).
        drag: {
          onStart: (_e, ctx) => (ctx.scratch.cycled ? 'claim' : 'pass'),
          onMove: () => 'claim',
          onEnd: () => 'claim',
        },
      }),
    [adapter],
  );
}
