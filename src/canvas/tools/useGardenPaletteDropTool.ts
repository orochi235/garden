import { useEffect, type RefObject } from 'react';
import { createDragGhost, screenToWorld, roundToCell } from '@orochi235/weasel';
import { onIconLoad, renderPlant } from '../plantRenderers';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createPlanting, createStructure, createZone } from '../../model/types';
import { getPlantingPosition } from '../../utils/planting';
import type { PaletteEntry } from '../../components/palette/paletteData';

interface Options {
  containerRef: RefObject<HTMLDivElement | null>;
}

/**
 * Palette → garden canvas drop tool.
 *
 * Mirrors `usePaletteDropTool` (the seed-starting variant) but for garden mode:
 * watches `useUiStore.palettePointerPayload`, runs its own document-level
 * pointer pipeline with a ghost icon + transient drag overlay, and commits via
 * `useGardenStore` add* actions on release.
 *
 * Garden mode keeps `useUiStore.zoom`/`panX`/`panY` as the source of truth for
 * the canvas viewport (other layers/tools still read them directly), so this
 * tool reads them straight from the store rather than from a `viewRef` like
 * the seed-starting variant. The full view-ownership migration to a
 * canvas-local `viewRef` is deferred — see `docs/TODO.md`.
 *
 * The legacy implementation lived inline in `App.handlePaletteDragBegin`; that
 * function is now a 3-line setter that hands the gesture off to this hook.
 */
export function useGardenPaletteDropTool({ containerRef }: Options): void {
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
        stopGesture = startGesture(next.entry, next.pointerEvent);
      }
    });

    function getCanvasRect(): DOMRect | null {
      const el = containerRef.current;
      return el?.getBoundingClientRect() ?? null;
    }

    function worldFromClient(clientX: number, clientY: number, rect: DOMRect): [number, number] {
      const { panX, panY, zoom } = useUiStore.getState();
      return screenToWorld(clientX - rect.left, clientY - rect.top, { panX, panY, zoom });
    }

    function startGesture(entry: PaletteEntry, pe: PointerEvent): () => void {
      const startX = pe.clientX;
      const startY = pe.clientY;
      const threshold = 4;
      let activated = false;
      let transientObj:
        | ReturnType<typeof createStructure>
        | ReturnType<typeof createZone>
        | ReturnType<typeof createPlanting>
        | null = null;
      let ghost: ReturnType<typeof createDragGhost> | null = null;
      let unsubIcon: (() => void) | null = null;

      function ensureGhost() {
        if (ghost) return ghost;
        const { zoom } = useUiStore.getState();
        const cellPx = useGardenStore.getState().garden.gridCellSizeFt;
        if (entry.category === 'plantings') {
          const radius = Math.max(8, 0.4 * 30 * zoom);
          ghost = createDragGhost({
            sizeCss: radius * 2,
            paint: (ctx) => renderPlant(ctx, entry.id, radius, entry.color ?? '#888'),
          });
          unsubIcon = onIconLoad(() => ghost?.repaint());
        } else {
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
        }
        return ghost;
      }

      function clearGhost() {
        unsubIcon?.();
        unsubIcon = null;
        ghost?.destroy();
        ghost = null;
      }

      function createTransientObject(clientX: number, clientY: number) {
        const rect = getCanvasRect();
        if (!rect) return;
        const [worldX, worldY] = worldFromClient(clientX, clientY, rect);
        const { garden } = useGardenStore.getState();
        const cellSize = garden.gridCellSizeFt;

        if (entry.category === 'structures') {
          const snappedX = roundToCell(worldX - entry.defaultWidth / 2, cellSize);
          const snappedY = roundToCell(worldY - entry.defaultHeight / 2, cellSize);
          transientObj = createStructure({
            type: entry.type,
            x: snappedX,
            y: snappedY,
            width: entry.defaultWidth,
            height: entry.defaultHeight,
          });
          useUiStore.getState().setDragOverlay({
            layer: 'structures',
            objects: [transientObj],
            hideIds: [],
            snapped: false,
          });
        } else if (entry.category === 'zones') {
          const snappedX = roundToCell(worldX - entry.defaultWidth / 2, cellSize);
          const snappedY = roundToCell(worldY - entry.defaultHeight / 2, cellSize);
          transientObj = createZone({
            x: snappedX,
            y: snappedY,
            width: entry.defaultWidth,
            height: entry.defaultHeight,
            color: entry.color,
            pattern: entry.pattern ?? null,
          });
          useUiStore.getState().setDragOverlay({
            layer: 'zones',
            objects: [transientObj],
            hideIds: [],
            snapped: false,
          });
        } else if (entry.category === 'plantings') {
          const container = garden.structures.find(
            (s) =>
              s.container &&
              worldX >= s.x && worldX <= s.x + s.width &&
              worldY >= s.y && worldY <= s.y + s.height,
          );
          const zone = garden.zones.find(
            (z) =>
              worldX >= z.x && worldX <= z.x + z.width &&
              worldY >= z.y && worldY <= z.y + z.height,
          );
          const parent = container ?? zone;
          if (parent) {
            const pos = getPlantingPosition(
              parent,
              garden.plantings.filter((p) => p.parentId === parent.id),
              worldX,
              worldY,
              cellSize,
            );
            transientObj = createPlanting({
              parentId: parent.id,
              x: pos.x,
              y: pos.y,
              cultivarId: entry.id,
            });
            useUiStore.getState().setDragOverlay({
              layer: 'plantings',
              objects: [transientObj],
              hideIds: [],
              snapped: false,
            });
          }
        }
      }

      function updateOverlayPosition(clientX: number, clientY: number) {
        if (!transientObj) return;
        const rect = getCanvasRect();
        if (!rect) return;
        const [worldX, worldY] = worldFromClient(clientX, clientY, rect);
        const { garden } = useGardenStore.getState();
        const cellSize = garden.gridCellSizeFt;
        const currentOverlay = useUiStore.getState().dragOverlay;
        if (!currentOverlay) return;

        if (entry.category === 'structures' || entry.category === 'zones') {
          const snappedX = roundToCell(worldX - entry.defaultWidth / 2, cellSize);
          const snappedY = roundToCell(worldY - entry.defaultHeight / 2, cellSize);
          const updated = { ...transientObj, x: snappedX, y: snappedY };
          transientObj = updated;
          useUiStore.getState().setDragOverlay({ ...currentOverlay, objects: [updated] });
        } else if (entry.category === 'plantings') {
          const container = garden.structures.find(
            (s) =>
              s.container &&
              worldX >= s.x && worldX <= s.x + s.width &&
              worldY >= s.y && worldY <= s.y + s.height,
          );
          const zone = garden.zones.find(
            (z) =>
              worldX >= z.x && worldX <= z.x + z.width &&
              worldY >= z.y && worldY <= z.y + z.height,
          );
          const parent = container ?? zone;
          if (parent) {
            const pos = getPlantingPosition(
              parent,
              garden.plantings.filter((p) => p.parentId === parent.id),
              worldX,
              worldY,
              cellSize,
            );
            const updated = { ...transientObj, parentId: parent.id, x: pos.x, y: pos.y };
            transientObj = updated;
            useUiStore.getState().setDragOverlay({ ...currentOverlay, objects: [updated], snapped: false });
          } else {
            useUiStore.getState().clearDragOverlay();
          }
        }
      }

      function maybeActivate(ev: PointerEvent) {
        if (activated) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy < threshold * threshold) return;
        activated = true;
        ensureGhost().move(ev.clientX, ev.clientY);
        createTransientObject(ev.clientX, ev.clientY);
        ghost?.setHidden(useUiStore.getState().dragOverlay != null);
      }

      function onMove(ev: PointerEvent) {
        maybeActivate(ev);
        if (!activated) return;
        ensureGhost().move(ev.clientX, ev.clientY);
        updateOverlayPosition(ev.clientX, ev.clientY);
        ghost?.setHidden(useUiStore.getState().dragOverlay != null);
      }

      function commit(ev: PointerEvent) {
        const rect = getCanvasRect();
        if (!rect) return;
        const [worldX, worldY] = worldFromClient(ev.clientX, ev.clientY, rect);
        const { garden, addStructure, addZone, addPlanting } = useGardenStore.getState();
        const cellSize = garden.gridCellSizeFt;
        const snappedX = roundToCell(worldX - entry.defaultWidth / 2, cellSize);
        const snappedY = roundToCell(worldY - entry.defaultHeight / 2, cellSize);

        if (entry.category === 'structures') {
          addStructure({
            type: entry.type,
            x: snappedX,
            y: snappedY,
            width: entry.defaultWidth,
            height: entry.defaultHeight,
          });
        } else if (entry.category === 'zones') {
          addZone({
            x: snappedX,
            y: snappedY,
            width: entry.defaultWidth,
            height: entry.defaultHeight,
          });
        } else if (entry.category === 'plantings') {
          const container = garden.structures.find(
            (s) =>
              s.container &&
              worldX >= s.x && worldX <= s.x + s.width &&
              worldY >= s.y && worldY <= s.y + s.height,
          );
          const zone = garden.zones.find(
            (z) =>
              worldX >= z.x && worldX <= z.x + z.width &&
              worldY >= z.y && worldY <= z.y + z.height,
          );
          const parent = container ?? zone;
          if (parent) {
            const pos = getPlantingPosition(
              parent,
              garden.plantings.filter((p) => p.parentId === parent.id),
              worldX,
              worldY,
              cellSize,
            );
            addPlanting({
              parentId: parent.id,
              x: pos.x,
              y: pos.y,
              cultivarId: entry.id,
            });
          }
        }
      }

      function teardown() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onCancel);
        clearGhost();
        useUiStore.getState().clearDragOverlay();
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
  }, []);
}
