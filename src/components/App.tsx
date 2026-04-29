import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasStack } from '../canvas/CanvasStack';
import { hitTestCell } from '../canvas/seedStartingHitTest';
import { useActiveTheme } from '../hooks/useActiveTheme';
import { createPlanting, createStructure, createZone } from '../model/types';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/App.module.css';
import { enterSeedStarting } from '../utils/enterSeedStarting';
import { autosave } from '../utils/file';
import { screenToWorld, snapToGrid } from '../utils/grid';
import { getPlantingPosition } from '../utils/planting';
import { FpsMeter } from './FpsMeter';
import { MenuBar } from './MenuBar';
import { ObjectPalette } from './palette/ObjectPalette';
import type { PaletteEntry } from './palette/paletteData';
import { SeedStartingPalette } from './palette/SeedStartingPalette';
import { StatusBar } from './StatusBar';
import { Sidebar } from './sidebar/Sidebar';

const MIN_PANEL = 160;
const MAX_PANEL = 400;
const DEFAULT_PANEL = 240;

export function App() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);
  const appMode = useUiStore((s) => s.appMode);
  const { theme, prevTheme, layerFlip, transitionDuration } = useActiveTheme();
  const [leftWidth, setLeftWidth] = useState(DEFAULT_PANEL);
  const [rightWidth, setRightWidth] = useState(DEFAULT_PANEL);
  const dragging = useRef<'left' | 'right' | null>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  useEffect(() => {
    // TODO: re-enable autosave loading once blank-canvas bug is fixed
    fetch(`${import.meta.env.BASE_URL}default.garden`)
      .then((r) => r.json())
      .then((g) => loadGarden(g))
      .catch(() => {})
      .finally(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'seed-starting') enterSeedStarting();
      });
  }, [loadGarden]);

  useEffect(() => {
    autosave(garden);
  }, [garden]);

  const handlePaletteDragBegin = useCallback(
    (entry: PaletteEntry, e: React.PointerEvent) => {
      const startX = e.clientX;
      const startY = e.clientY;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const THRESHOLD = 4;
      let dragging = false;
      let transientObj: ReturnType<typeof createStructure> | ReturnType<typeof createZone> | ReturnType<typeof createPlanting> | null = null;

      function getCanvasRect() {
        const el = document.querySelector('[data-canvas-container]') as HTMLElement | null;
        return el?.getBoundingClientRect() ?? null;
      }

      function worldFromClient(clientX: number, clientY: number, rect: DOMRect) {
        const { panX, panY, zoom } = useUiStore.getState();
        return screenToWorld(clientX - rect.left, clientY - rect.top, { panX, panY, zoom });
      }

      function createTransientObject(clientX: number, clientY: number) {
        const rect = getCanvasRect();
        if (!rect) return;
        const [worldX, worldY] = worldFromClient(clientX, clientY, rect);
        const { garden } = useGardenStore.getState();
        const cellSize = garden.gridCellSizeFt;

        if (entry.category === 'structures') {
          const snappedX = snapToGrid(worldX - entry.defaultWidth / 2, cellSize);
          const snappedY = snapToGrid(worldY - entry.defaultHeight / 2, cellSize);
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
          const snappedX = snapToGrid(worldX - entry.defaultWidth / 2, cellSize);
          const snappedY = snapToGrid(worldY - entry.defaultHeight / 2, cellSize);
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
          const snappedX = snapToGrid(worldX - entry.defaultWidth / 2, cellSize);
          const snappedY = snapToGrid(worldY - entry.defaultHeight / 2, cellSize);
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

      function onPointerMove(ev: PointerEvent) {
        if (!dragging) {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
          dragging = true;
          createTransientObject(ev.clientX, ev.clientY);
        }
        updateOverlayPosition(ev.clientX, ev.clientY);
      }

      function onPointerUp(ev: PointerEvent) {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        target.releasePointerCapture(ev.pointerId);

        if (!dragging) return;

        // Commit the drop
        const rect = getCanvasRect();
        if (rect) {
          const { panX, panY, zoom } = useUiStore.getState();
          const [worldX, worldY] = screenToWorld(
            ev.clientX - rect.left,
            ev.clientY - rect.top,
            { panX, panY, zoom },
          );
          const { garden, addStructure, addZone, addPlanting } = useGardenStore.getState();
          const cellSize = garden.gridCellSizeFt;
          const snappedX = snapToGrid(worldX - entry.defaultWidth / 2, cellSize);
          const snappedY = snapToGrid(worldY - entry.defaultHeight / 2, cellSize);

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

        useUiStore.getState().clearDragOverlay();
      }

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [],
  );

  const handleSeedDragBegin = useCallback(
    (entry: PaletteEntry, e: React.PointerEvent) => {
      if (entry.category !== 'plantings') return;
      const startX = e.clientX;
      const startY = e.clientY;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const THRESHOLD = 4;
      let dragging = false;

      function currentViewport(rect: DOMRect) {
        const ui = useUiStore.getState();
        const garden = useGardenStore.getState().garden;
        const tray = garden.seedStarting.trays.find((t) => t.id === ui.currentTrayId);
        if (!tray) return null;
        const trayPxW = tray.widthIn * ui.seedStartingZoom;
        const trayPxH = tray.heightIn * ui.seedStartingZoom;
        return {
          tray,
          pxPerInch: ui.seedStartingZoom,
          originX: (rect.width - trayPxW) / 2 + ui.seedStartingPanX,
          originY: (rect.height - trayPxH) / 2 + ui.seedStartingPanY,
        };
      }

      function viewport() {
        const el = document.querySelector('[data-canvas-container]') as HTMLElement | null;
        const rect = el?.getBoundingClientRect();
        if (!rect) return null;
        const vp = currentViewport(rect);
        if (!vp) return null;
        return { rect, vp };
      }

      let ghost: HTMLDivElement | null = null;
      function ensureGhost() {
        if (ghost) return ghost;
        const el = document.createElement('div');
        el.style.cssText = [
          'position:fixed', 'pointer-events:none', 'z-index:9999',
          'width:24px', 'height:24px', 'border-radius:50%',
          `background:${entry.color ?? '#888'}`,
          'box-shadow:0 0 0 2px #fff, 0 2px 8px rgba(0,0,0,0.4)',
          'transform:translate(-50%,-50%)',
          'opacity:0.85',
        ].join(';');
        document.body.appendChild(el);
        ghost = el;
        return el;
      }
      function moveGhost(x: number, y: number) {
        const g = ensureGhost();
        g.style.left = `${x}px`;
        g.style.top = `${y}px`;
      }
      function clearGhost() {
        if (ghost) ghost.remove();
        ghost = null;
      }

      let lastClientX = startX;
      let lastClientY = startY;
      let shiftHeld = false;

      function updateFillPreview() {
        const setPreview = useUiStore.getState().setSeedFillPreview;
        if (!dragging || !shiftHeld) {
          setPreview(null);
          return;
        }
        const v = viewport();
        if (!v) {
          setPreview(null);
          return;
        }
        const sx = lastClientX - v.rect.left;
        const sy = lastClientY - v.rect.top;
        const hit = hitTestCell(v.vp.tray, v.vp, sx, sy);
        setPreview(hit ? { trayId: v.vp.tray.id, cultivarId: entry.id } : null);
      }

      function onMove(ev: PointerEvent) {
        lastClientX = ev.clientX;
        lastClientY = ev.clientY;
        shiftHeld = ev.shiftKey;
        if (!dragging) {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
          dragging = true;
          (target as HTMLElement & { __dragged?: boolean }).__dragged = true;
        }
        moveGhost(ev.clientX, ev.clientY);
        updateFillPreview();
      }

      function onKey(ev: KeyboardEvent) {
        if (ev.key !== 'Shift') return;
        shiftHeld = ev.type === 'keydown';
        updateFillPreview();
      }

      function onUp(ev: PointerEvent) {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('keyup', onKey);
        target.releasePointerCapture(ev.pointerId);
        clearGhost();
        useUiStore.getState().setSeedFillPreview(null);
        if (!dragging) return;

        const v = viewport();
        if (!v) return;
        if (ev.shiftKey) {
          useGardenStore.getState().fillTray(v.vp.tray.id, entry.id);
          return;
        }
        const sx = ev.clientX - v.rect.left;
        const sy = ev.clientY - v.rect.top;
        const hit = hitTestCell(v.vp.tray, v.vp, sx, sy);
        if (!hit) return;
        useGardenStore.getState().sowCell(v.vp.tray.id, hit.row, hit.col, entry.id);
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('keydown', onKey);
      document.addEventListener('keyup', onKey);
    },
    [],
  );

  const handleResizeStart = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = side;
      dragStartX.current = e.clientX;
      dragStartWidth.current = side === 'left' ? leftWidth : rightWidth;
    },
    [leftWidth, rightWidth],
  );

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const dx = e.clientX - dragStartX.current;
      const newWidth = Math.min(
        MAX_PANEL,
        Math.max(
          MIN_PANEL,
          dragging.current === 'left' ? dragStartWidth.current + dx : dragStartWidth.current - dx,
        ),
      );
      if (dragging.current === 'left') setLeftWidth(newWidth);
      else setRightWidth(newWidth);
    }

    function handleMouseUp() {
      dragging.current = null;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const layerATheme = layerFlip ? theme : (prevTheme ?? theme);
  const layerBTheme = layerFlip ? (prevTheme ?? theme) : theme;
  const layerAOpacity = layerFlip ? 1 : 0;
  const layerBOpacity = layerFlip ? 0 : 1;

  return (
    <div
      className={styles.layout}
      style={{
        gridTemplateColumns: `${leftWidth}px 4px 1fr 4px ${rightWidth}px`,
      }}
    >
      <div
        className={styles.gradientLayer}
        style={{
          background: layerATheme.paletteBackground,
          opacity: layerAOpacity,
          transition: `opacity ${transitionDuration} ease`,
        }}
      />
      <div
        className={styles.gradientLayer}
        style={{
          background: layerBTheme.paletteBackground,
          opacity: layerBOpacity,
          transition: `opacity ${transitionDuration} ease`,
        }}
      />
      <div className={styles.menu}>
        <MenuBar />
      </div>
      <div className={styles.palette}>
        {appMode === 'seed-starting' ? (
          <SeedStartingPalette onDragBegin={handleSeedDragBegin} />
        ) : (
          <ObjectPalette onDragBegin={handlePaletteDragBegin} />
        )}
      </div>
      <div
        className={`${styles.resizeHandle} ${styles.leftHandle}`}
        onMouseDown={(e) => handleResizeStart('left', e)}
      />
      <div className={styles.canvas}>
        <CanvasStack />
      </div>
      <div
        className={`${styles.resizeHandle} ${styles.rightHandle}`}
        onMouseDown={(e) => handleResizeStart('right', e)}
      />
      <div className={styles.sidebar}>
        <Sidebar />
      </div>
      <div className={styles.status}>
        <StatusBar />
      </div>
      <FpsMeter />
    </div>
  );
}
