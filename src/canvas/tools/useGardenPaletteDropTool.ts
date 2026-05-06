import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { createDragGhost, screenToWorld, roundToCell } from '@orochi235/weasel';
import { onIconLoad, renderPlant } from '../plantRenderers';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { getCultivar } from '../../model/cultivars';
import type { PaletteEntry } from '../../components/palette/paletteData';
import { useDragController } from '../drag/useDragController';
import {
  createGardenPaletteDrag,
  GARDEN_PALETTE_DRAG_KIND,
  type GardenPaletteInput,
  type GardenPalettePutative,
} from '../drag/gardenPaletteDrag';
import type { DragViewport } from '../drag/putativeDrag';
import type { View } from '../layers/worldLayerData';

interface Options {
  containerRef: RefObject<HTMLDivElement | null>;
  /** Canvas-owned camera-coord view; the tool reads it for screen→world math. */
  viewRef: RefObject<View>;
}

/**
 * Palette → garden canvas drop tool.
 *
 * Watches `useUiStore.palettePointerPayload`. The plantings branch is
 * Phase-2-migrated onto the putative-drag framework: the gesture hands off to
 * `useDragController.start()` with the `garden-palette-plant` drag, which
 * runs read → compute → setDragPreview and commits via `addPlanting` on
 * release. The drag's `renderPreview` is drawn by the generic
 * `dragPreviewLayer` registered on the garden canvas.
 *
 * The structures/zones branch is still bespoke — those drags have no
 * in-canvas preview today (only the floating HTML ghost), so they don't yet
 * benefit from the framework. They remain on a small document-level pointer
 * pipeline below; migrating them is the "plot (rectangle drag)" item in the
 * Phase 2+ TODO.
 *
 * The garden canvas owns its viewport state in local React state. The hook
 * receives a `viewRef` from the canvas and uses it for screen→world math —
 * matching the seed-starting `usePaletteDropTool` pattern.
 */
export function useGardenPaletteDropTool({ containerRef, viewRef }: Options): void {
  const entryRef = useRef<PaletteEntry | null>(null);
  const drag = useMemo(
    () => createGardenPaletteDrag({ getEntry: () => entryRef.current }),
    [],
  );
  const registry = useMemo(() => ({ [drag.kind]: drag as never }), [drag]);
  const controller = useDragController(registry);

  useEffect(() => {
    let stopGesture: (() => void) | null = null;

    const unsub = useUiStore.subscribe((state, prev) => {
      const next = state.palettePointerPayload;
      const before = prev.palettePointerPayload;
      if (next === before) return;
      // Only run while in garden mode — seed-starting mode has its own tool.
      if (useUiStore.getState().appMode !== 'garden') return;
      if (stopGesture) {
        stopGesture();
        stopGesture = null;
      }
      if (next) {
        stopGesture =
          next.entry.category === 'plantings'
            ? startPlantingGesture(next.entry, next.pointerEvent)
            : startStructureZoneGesture(next.entry, next.pointerEvent);
      }
    });

    function getCanvasRect(): DOMRect | null {
      const el = containerRef.current;
      return el?.getBoundingClientRect() ?? null;
    }

    function getViewport(): DragViewport | null {
      const el = containerRef.current;
      const view = viewRef.current;
      if (!el || !view || view.scale <= 0) return null;
      return { container: el, view };
    }

    // ----- Plantings: framework path ---------------------------------------
    function startPlantingGesture(entry: PaletteEntry, pe: PointerEvent): () => void {
      entryRef.current = entry;

      // DOM-side ghost icon (not part of the pure compute pipeline).
      let ghost: ReturnType<typeof createDragGhost> | null = null;
      let unsubIcon: (() => void) | null = null;
      function ensureGhost() {
        if (ghost) return ghost;
        const zoom = viewRef.current?.scale ?? 1;
        const cultivar = getCultivar(entry.id);
        const footprintFt = cultivar?.footprintFt ?? 0.5;
        const iconScale = useUiStore.getState().plantIconScale ?? 1;
        const radius = Math.max(8, (footprintFt / 2) * iconScale * zoom);
        ghost = createDragGhost({
          sizeCss: radius * 2,
          paint: (ctx) => renderPlant(ctx, entry.id, radius, entry.color ?? '#888'),
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

      const stop = controller.start<GardenPaletteInput, GardenPalettePutative>(
        GARDEN_PALETTE_DRAG_KIND,
        pe,
        getViewport,
        {
          threshold: 4,
          onActivate: () => {
            ensureGhost().move(pe.clientX, pe.clientY);
          },
          onPutativeChange: (putative) => {
            // Hide the floating ghost while a canvas-side ghost preview is
            // showing — same UX the legacy bespoke tool had.
            ghost?.setHidden(putative != null);
          },
          onTeardown: () => {
            clearGhost();
            entryRef.current = null;
            useUiStore.getState().setPalettePointerPayload(null);
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

    // ----- Structures + zones: bespoke path (unchanged) --------------------
    function worldFromClient(clientX: number, clientY: number, rect: DOMRect): [number, number] {
      const view = viewRef.current;
      if (!view || view.scale <= 0) return [0, 0];
      // Convert canvas-camera View {x, y, scale} → screenToWorld's
      // {panX, panY, zoom} shape (screen-space pan in pixels).
      const zoom = view.scale;
      const panX = -view.x * zoom;
      const panY = -view.y * zoom;
      return screenToWorld(clientX - rect.left, clientY - rect.top, { panX, panY, zoom });
    }

    function startStructureZoneGesture(entry: PaletteEntry, pe: PointerEvent): () => void {
      const startX = pe.clientX;
      const startY = pe.clientY;
      const threshold = 4;
      let activated = false;
      let ghost: ReturnType<typeof createDragGhost> | null = null;

      function ensureGhost() {
        if (ghost) return ghost;
        const zoom = viewRef.current?.scale ?? 1;
        const cellPx = useGardenStore.getState().garden.gridCellSizeFt;
        const sizeCss = Math.max(24, Math.min(80, entry.defaultWidth * cellPx * zoom));
        ghost = createDragGhost({
          sizeCss,
          paint: (ctx, size) => {
            ctx.fillStyle = entry.color ?? '#888';
            ctx.globalAlpha = 0.7;
            ctx.fillRect(-size / 2, -size / 2, size, size);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-size / 2 + 1, -size / 2 + 1, size - 2, size - 2);
          },
        });
        return ghost;
      }
      function clearGhost() {
        ghost?.destroy();
        ghost = null;
      }

      function maybeActivate(ev: PointerEvent) {
        if (activated) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy < threshold * threshold) return;
        activated = true;
        ensureGhost().move(ev.clientX, ev.clientY);
      }

      function onMove(ev: PointerEvent) {
        maybeActivate(ev);
        if (!activated) return;
        ensureGhost().move(ev.clientX, ev.clientY);
      }

      function commit(ev: PointerEvent) {
        const rect = getCanvasRect();
        if (!rect) return;
        const [worldX, worldY] = worldFromClient(ev.clientX, ev.clientY, rect);
        const { garden, addStructure, addZone } = useGardenStore.getState();
        const cellSize = garden.gridCellSizeFt;
        const snappedX = roundToCell(worldX - entry.defaultWidth / 2, cellSize);
        const snappedY = roundToCell(worldY - entry.defaultLength / 2, cellSize);

        if (entry.category === 'structures') {
          addStructure({
            type: entry.type,
            x: snappedX,
            y: snappedY,
            width: entry.defaultWidth,
            length: entry.defaultLength,
          });
        } else if (entry.category === 'zones') {
          addZone({
            x: snappedX,
            y: snappedY,
            width: entry.defaultWidth,
            length: entry.defaultLength,
            color: entry.color,
            pattern: entry.pattern ?? null,
          });
        }
      }

      function teardown() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onCancel);
        clearGhost();
        useUiStore.getState().setPalettePointerPayload(null);
      }

      function onUp(ev: PointerEvent) {
        if (activated) commit(ev);
        teardown();
      }

      function onCancel() {
        teardown();
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel);

      return teardown;
    }

    return () => {
      unsub();
      if (stopGesture) stopGesture();
    };
    // containerRef is stable; subscription should run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);
}
