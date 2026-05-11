import { useMemo } from 'react';
import type React from 'react';
import { defineTool, type Tool } from '@orochi235/weasel';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { findSeedlingsInRect, hitTestCellInches } from '../seedStartingHitTest';
import { trayWorldOrigin, type SeedStartingSceneAdapter } from '../adapters/seedStartingScene';
import { AREA_SELECT_DRAG_KIND, type AreaSelectPutative } from '../drag/areaSelectDrag';
import { hitTestTrayLabel } from '../layers/trayLayersWorld';
import type { View } from '../layers/worldLayerData';

/**
 * Dedicated marquee/area-select tool for the seed-starting view.
 *
 * Cooperates with `useSeedlingMoveTool` via claim ordering: this tool runs in
 * the `alwaysOn` slot AFTER the active move tool. When the move tool's
 * `pointer.onDown` returns `'pass'` (i.e. the down landed on empty tray
 * background, not on a seedling), the dispatcher walks to this tool which
 * claims and seeds a marquee gesture. When the down lands on a seedling, the
 * move tool claims first and this tool never runs.
 *
 * Live marquee rendering is delegated to the framework's `dragPreviewLayer` /
 * `areaSelectDrag.renderPreview` — every `drag.onMove` writes the current
 * marquee rect into `useUiStore.dragPreview` (kind: `AREA_SELECT_DRAG_KIND`)
 * and `onEnd` clears it. Selection commit reads
 * `findSeedlingsInRect` over all trays (using `trayWorldOrigin` so cell centers
 * land in world space), then either replaces or extends `useUiStore.selectedIds`
 * (shift-additive vs. replace).
 *
 * Click-on-empty (no drag) clears selection. Click-on-seedling passes so the
 * move tool's onClick can manage selection (it leaves selection alone for
 * already-selected seedlings; selects the hit on plain click).
 */
export interface SeedSelectScratch {
  /** Active marquee gesture, or null when idle. World inches. */
  marquee: { startX: number; startY: number; x: number; y: number; shift: boolean } | null;
}

const initScratch = (): SeedSelectScratch => ({ marquee: null });

function publishMarquee(s: SeedSelectScratch['marquee']): void {
  const ui = useUiStore.getState();
  if (!s) {
    if (ui.dragPreview && ui.dragPreview.kind === AREA_SELECT_DRAG_KIND) {
      ui.setDragPreview(null);
    }
    return;
  }
  const putative: AreaSelectPutative = {
    start: { x: s.startX, y: s.startY },
    current: { x: s.x, y: s.y },
    shiftHeld: s.shift,
  };
  ui.setDragPreview({ kind: AREA_SELECT_DRAG_KIND, putative });
}

/** True when (worldX, worldY) lies on a seedling-occupied cell. */
function pointHitsSeedling(worldX: number, worldY: number): boolean {
  const ss = useGardenStore.getState().garden.nursery;
  for (const tray of ss.trays) {
    const o = trayWorldOrigin(tray, ss);
    const cell = hitTestCellInches(tray, worldX - o.x, worldY - o.y);
    if (!cell) continue;
    const slot = tray.slots[cell.row * tray.cols + cell.col];
    if (slot.state === 'sown' && slot.seedlingId) return true;
  }
  return false;
}

export interface SeedSelectOptions {
  /** Called when the user clicks a tray label. The canvas shows an inline rename input. */
  onLabelClick?: (trayId: string) => void;
  /** Current view — needed for label hit-testing (label area height is in screen px). */
  viewRef?: React.RefObject<View>;
}

export function useSeedSelectTool(
  adapter: SeedStartingSceneAdapter,
  options: SeedSelectOptions = {},
): Tool<SeedSelectScratch> {
  void adapter;
  const { onLabelClick, viewRef } = options;

  return useMemo(
    () =>
      defineTool<SeedSelectScratch>({
        id: 'seed-select',
        cursor: 'default',
        initScratch,

        pointer: {
          onClick: (e, ctx) => {
            if (e.button !== 0) return 'pass';
            // If the click landed on a seedling, defer — move tool's onClick
            // (or its onDown which already claimed) handles seedling clicks.
            if (pointHitsSeedling(ctx.worldX, ctx.worldY)) return 'pass';
            // Check for a label-area click — trigger inline rename.
            if (onLabelClick && viewRef?.current) {
              const ss = useGardenStore.getState().garden.nursery;
              const hit = hitTestTrayLabel(ss.trays, ss, viewRef.current, ctx.worldX, ctx.worldY);
              if (hit) {
                onLabelClick(hit.id);
                return 'claim';
              }
            }
            // No-drag click on empty: clear selection (unless shift, to match
            // garden-mode parity).
            if (!ctx.modifiers.shift) useUiStore.getState().clearSelection();
            ctx.scratch.marquee = null;
            return 'claim';
          },
          onDown: (e, ctx) => {
            if (e.button !== 0) return 'pass';
            // A palette drag-to-sow is active; defer to sow tool.
            if (useUiStore.getState().seedDragCultivarId) return 'pass';
            // Down on a seedling — let the move tool handle it.
            if (pointHitsSeedling(ctx.worldX, ctx.worldY)) return 'pass';
            ctx.scratch.marquee = {
              startX: ctx.worldX,
              startY: ctx.worldY,
              x: ctx.worldX,
              y: ctx.worldY,
              shift: ctx.modifiers.shift,
            };
            return 'claim';
          },
        },

        drag: {
          onStart: (_e, ctx) => {
            if (!ctx.scratch.marquee) return 'pass';
            publishMarquee(ctx.scratch.marquee);
            return 'claim';
          },
          onMove: (_e, ctx) => {
            if (!ctx.scratch.marquee) return 'pass';
            ctx.scratch.marquee.x = ctx.worldX;
            ctx.scratch.marquee.y = ctx.worldY;
            publishMarquee(ctx.scratch.marquee);
            return 'claim';
          },
          onEnd: (_e, ctx) => {
            const m = ctx.scratch.marquee;
            if (!m) return 'pass';
            const ss = useGardenStore.getState().garden.nursery;
            const rect = {
              x: m.startX,
              y: m.startY,
              width: m.x - m.startX,
              height: m.y - m.startY,
            };
            const ids = findSeedlingsInRect(ss.trays, ss.seedlings, rect, (t) =>
              trayWorldOrigin(t, ss),
            );
            const ui = useUiStore.getState();
            if (m.shift) {
              const merged = Array.from(new Set([...ui.selectedIds, ...ids]));
              ui.setSelection(merged);
            } else {
              ui.setSelection(ids);
            }
            ctx.scratch.marquee = null;
            publishMarquee(null);
            return 'claim';
          },
          onCancel: (ctx) => {
            ctx.scratch.marquee = null;
            publishMarquee(null);
          },
        },
      }),
    [],
  );
}
