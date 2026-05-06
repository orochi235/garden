import { useMemo, useRef, useState } from 'react';
import {
  defineTool,
  useClone,
  cloneByAltDrag,
  type Tool,
  type RenderLayer,
} from '@orochi235/weasel';
import { useUiStore } from '../../store/uiStore';
import { useGardenStore } from '../../store/gardenStore';
import { getCultivar } from '../../model/cultivars';
import { renderPlant } from '../plantRenderers';
import type { GardenSceneAdapter } from '../adapters/gardenScene';
import type { GardenInsertAdapter } from '../adapters/insert';
import { expandToGroups } from '../../utils/groups';

export interface CycleScratch { cycled: boolean }

interface CycleMemo {
  worldX: number;
  worldY: number;
  ids: string[];
  /** Index in `ids` of the most recently selected entry. */
  index: number;
}

interface CloneOverlayItem { id: string; x: number; y: number }

/** Alt+click cycles through overlapping objects at the cursor. The first
 *  alt-click selects the top-most hit; each subsequent alt-click at the same
 *  spot advances through the stack. Memo resets when the cursor moves to a
 *  different (worldX, worldY) point — the threshold is intentionally tiny
 *  since clicks at "the same spot" are typically pixel-perfect.
 *
 *  Alt+drag (after hitting an object) clones the current selection via the
 *  kit's `useClone` + `cloneByAltDrag` behavior. Requires `insertAdapter`
 *  to be provided; if omitted, alt+drag does nothing (backwards-compatible
 *  with call-sites that haven't wired the adapter yet). */
export function useEricCycleTool(
  adapter: GardenSceneAdapter,
  insertAdapter?: GardenInsertAdapter,
): Tool<CycleScratch> {
  const memoRef = useRef<CycleMemo | null>(null);

  const [cloneOverlay, setCloneOverlay] = useState<CloneOverlayItem[]>([]);

  // Stub adapter keeps `useClone` hook-count stable even when no real adapter
  // is provided. Behaviours won't activate (alt check passes, but
  // snapshotSelection returns nothing → end is a no-op).
  const stubAdapter = useMemo<GardenInsertAdapter>(() => ({
    commitInsert: () => null,
    commitPaste: () => [],
    getPasteOffset: () => ({ dx: 0, dy: 0 }),
    snapshotSelection: () => ({ items: [] }),
    insertObject: () => {},
    removeObject: () => {},
    getObject: () => undefined,
    setSelection: () => {},
    getSelection: () => [],
    applyBatch: () => {},
  }), []);

  const clone = useClone<{ id: string }>(insertAdapter ?? stubAdapter, {
    behaviors: [cloneByAltDrag()],
    setOverlay: (_layer, objects) => setCloneOverlay(objects as CloneOverlayItem[]),
    clearOverlay: () => setCloneOverlay([]),
  });

  const overlay = useMemo<RenderLayer<unknown>>(
    () => ({
      id: 'eric-cycle-clone-overlay',
      label: 'Cycle-Clone Overlay (eric)',
      space: 'screen',
      alwaysOn: true,
      draw(ctx, _data, view) {
        if (cloneOverlay.length === 0) return;
        const garden = useGardenStore.getState().garden;
        for (const item of cloneOverlay) {
          const planting = garden.plantings.find((p) => p.id === item.id);
          if (!planting) continue;
          const cultivar = getCultivar(planting.cultivarId);
          if (!cultivar) continue;
          const footprintFt = cultivar.footprintFt ?? 0.5;
          const sx = (item.x - view.x) * view.scale;
          const sy = (item.y - view.y) * view.scale;
          const radiusPx = (footprintFt / 2) * view.scale;
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.translate(sx, sy);
          renderPlant(ctx, planting.cultivarId, radiusPx, cultivar.color);
          ctx.restore();
        }
      },
    }),
    [cloneOverlay],
  );

  return useMemo(
    () =>
      defineTool<CycleScratch>({
        id: 'eric-cycle',
        modifier: 'alt',
        initScratch: () => ({ cycled: false }),
        overlay,
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
        // Alt+drag after a cycle-click → clone the selection. If no
        // insertAdapter was provided, we claim and no-op (safe default).
        drag: {
          onStart: (_e, ctx) => {
            if (!ctx.scratch.cycled) return 'pass';
            if (insertAdapter) {
              const ids = useUiStore.getState().selectedIds;
              if (ids.length > 0) {
                // Expand to group siblings so alt-drag clones the whole
                // group, not just the cycled member. Consistent with
                // useEricSelectTool's move/clone expansion.
                const structures = useGardenStore.getState().garden.structures;
                const expanded = expandToGroups(ids, structures);
                clone.start(ctx.worldX, ctx.worldY, expanded, 'plantings', ctx.modifiers);
              }
            }
            return 'claim';
          },
          onMove: (_e, ctx) => {
            if (clone.isCloning) {
              clone.move(ctx.worldX, ctx.worldY, ctx.modifiers);
            }
            return 'claim';
          },
          onEnd: (_e, _ctx) => {
            if (clone.isCloning) {
              clone.end();
            }
            return 'claim';
          },
          onCancel: () => {
            if (clone.isCloning) {
              clone.cancel();
            }
          },
        },
      }),
    [adapter, clone, insertAdapter, overlay],
  );
}
