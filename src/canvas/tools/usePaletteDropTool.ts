import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { createDragGhost } from '../drag/dragGhost';
import { onIconLoad, renderPlant } from '../plantRenderers';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { View } from '../layers/worldLayerData';
import type { Tray } from '../../model/nursery';
import { useDragController } from '../drag/useDragController';
import {
  createSeedFillTrayDrag,
  SEED_FILL_TRAY_DRAG_KIND,
  type SeedFillPutative,
} from '../drag/seedFillTrayDrag';
import type { DragViewport } from '../drag/putativeDrag';

interface Options {
  containerRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<View>;
}

/**
 * Palette → nursery canvas drop tool.
 *
 * The kit's `Tool` primitive only sees pointer events the canvas dispatcher
 * gets, but palette drags begin on the palette item — so the dispatcher never
 * sees their pointerdown. This hook subscribes to `palettePointerPayload` and,
 * when one arrives, hands the gesture off to the putative-drag controller
 * (`useDragController`) using the seed-fill-tray drag.
 *
 * The hook still owns DOM artifacts that aren't part of the pure compute
 * pipeline: the floating drag ghost icon, hiding the ghost while a fill
 * preview is live, and arming `seedDragCultivarId` so the in-canvas
 * sow / fill tools also activate.
 */
export function usePaletteDropTool({ containerRef, viewRef }: Options): void {
  // The drag definition reads the cultivar id from a ref the hook owns; the
  // controller drives read/compute/commit and writes `dragPreview` (and via
  // `onPutativeChange`, the legacy `seedFillPreview` slot too).
  const cultivarRef = useRef<string | null>(null);

  const drag = useMemo(
    () => createSeedFillTrayDrag({ getCultivarId: () => cultivarRef.current }),
    [],
  );
  const registry = useMemo(() => ({ [drag.kind]: drag as never }), [drag]);
  const controller = useDragController(registry);

  useEffect(() => {
    let cleanupGhost: (() => void) | null = null;

    const unsub = useUiStore.subscribe((state, prev) => {
      const next = state.palettePointerPayload;
      const before = prev.palettePointerPayload;
      if (next === before) return;
      if (cleanupGhost) {
        cleanupGhost();
        cleanupGhost = null;
      }
      if (next && next.entry.category === 'plantings') {
        cleanupGhost = startGesture(next.entry, next.pointerEvent);
      }
    });

    function getCurrentTray(): Tray | null {
      const ui = useUiStore.getState();
      const garden = useGardenStore.getState().garden;
      return garden.nursery.trays.find((t) => t.id === ui.currentTrayId) ?? null;
    }

    function startGesture(
      entry: { id: string; color?: string; category: string },
      pe: PointerEvent,
    ): () => void {
      const threshold = 4;
      let ghost: ReturnType<typeof createDragGhost> | null = null;
      let unsubIcon: (() => void) | null = null;

      // Mirror legacy: arm `seedDragCultivarId` for in-canvas sow/fill tools.
      cultivarRef.current = entry.id;
      useUiStore.getState().setSeedDragCultivarId(entry.id);

      function ensureGhost() {
        if (ghost) return ghost;
        const tray = getCurrentTray();
        const ppi = viewRef.current?.scale ?? 30;
        const cellPx = tray ? tray.cellPitchIn * ppi : 30;
        const radius = (cellPx * 0.85) / 2;
        ghost = createDragGhost({
          sizeCss: radius * 2,
          paint: (ctx: CanvasRenderingContext2D) => renderPlant(ctx, entry.id, radius, entry.color ?? '#888'),
        });
        unsubIcon = onIconLoad(() => ghost?.repaint());
        return ghost;
      }

      function clearGhost() {
        unsubIcon?.();
        unsubIcon = null;
        ghost?.destroy();
        ghost = null;
      }

      const stop = controller.start<unknown, SeedFillPutative>(
        SEED_FILL_TRAY_DRAG_KIND,
        pe,
        (): DragViewport | null => {
          const el = containerRef.current;
          const view = viewRef.current;
          if (!el || !view) return null;
          return { container: el, view };
        },
        {
          threshold,
          onActivate: () => {
            ensureGhost().move(pe.clientX, pe.clientY);
          },
          onPutativeChange: (putative) => {
            // Hide the ghost while a fill preview is showing — same behavior
            // the legacy ad-hoc tool had.
            ghost?.setHidden(putative != null);
          },
          onTeardown: () => {
            clearGhost();
            cultivarRef.current = null;
            useUiStore.getState().setSeedDragCultivarId(null);
            useUiStore.getState().setPalettePointerPayload(null);
            // Belt-and-suspenders: the drag's onPutativeChange already clears
            // seedFillPreview when the controller writes null, but if
            // teardown fires for any other reason make sure the legacy slot
            // is empty.
            useUiStore.getState().setSeedFillPreview(null);
          },
        },
      );

      // Ghost follow: separate from the controller so it tracks even before
      // the threshold is crossed.
      function onMoveGhost(ev: PointerEvent) {
        if (ghost) ghost.move(ev.clientX, ev.clientY);
      }
      document.addEventListener('pointermove', onMoveGhost);

      return () => {
        document.removeEventListener('pointermove', onMoveGhost);
        stop();
      };
    }

    return () => {
      unsub();
      if (cleanupGhost) cleanupGhost();
    };
    // viewRef and containerRef are stable refs; subscription should run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);
}
