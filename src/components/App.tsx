import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasStack } from '../canvas/CanvasStack';
import { onIconLoad, renderPlant } from '../canvas/plantRenderers';
import { hitTestDragSpreadAffordance, hitTestCell } from '../canvas/seedStartingHitTest';
import { createDragGhost } from '../utils/dragGhost';
import { useActiveTheme } from '../hooks/useActiveTheme';
import { createPlanting, createStructure, createZone } from '../model/types';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/App.module.css';
import { enterSeedStarting } from '../utils/enterSeedStarting';
import { autosave } from '../utils/file';
import { screenToWorld, snapToGrid } from '../utils/grid';
import { getPlantingPosition } from '../utils/planting';
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
  const savedRightWidth = useRef(DEFAULT_PANEL);
  const prevAppMode = useRef(appMode);

  useEffect(() => {
    if (prevAppMode.current === appMode) return;
    if (appMode === 'seed-starting') {
      if (rightWidth > 0) savedRightWidth.current = rightWidth;
      setRightWidth(0);
    } else {
      setRightWidth(savedRightWidth.current || DEFAULT_PANEL);
    }
    prevAppMode.current = appMode;
  }, [appMode, rightWidth]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (appMode === 'seed-starting') {
      url.searchParams.set('mode', 'seed-starting');
    } else {
      url.searchParams.delete('mode');
    }
    const next = url.pathname + (url.search ? url.search : '') + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, '', next);
    }
  }, [appMode]);

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

      let ghost: ReturnType<typeof createDragGhost> | null = null;
      let unsubIcon: (() => void) | null = null;
      function ensureGhost() {
        if (ghost) return ghost;
        const ui = useUiStore.getState();
        const garden = useGardenStore.getState().garden;
        const tray = garden.seedStarting.trays.find((t) => t.id === ui.currentTrayId);
        const cellPx = tray ? tray.cellPitchIn * ui.seedStartingZoom : 30;
        const radius = (cellPx * 0.85) / 2;
        ghost = createDragGhost({
          sizeCss: radius * 2,
          paint: (ctx) => renderPlant(ctx, entry.id, radius, entry.color ?? '#888'),
        });
        unsubIcon = onIconLoad(() => ghost?.repaint());
        return ghost;
      }
      function moveGhost(x: number, y: number) {
        ensureGhost().move(x, y);
      }
      function setGhostHidden(hidden: boolean) {
        ghost?.setHidden(hidden);
      }
      function clearGhost() {
        unsubIcon?.();
        unsubIcon = null;
        ghost?.destroy();
        ghost = null;
      }

      let lastClientX = startX;
      let lastClientY = startY;
      let shiftHeld = false;

      function updateFillPreview() {
        const set = useUiStore.getState().setSeedFillPreview;
        const setPreview = (preview: Parameters<typeof set>[0]) => {
          set(preview);
          setGhostHidden(preview != null);
        };
        if (!dragging) {
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

        const replace = shiftHeld;
        const aff = hitTestDragSpreadAffordance(v.vp.tray, v.vp, sx, sy);
        if (aff) {
          if (aff.kind === 'all') {
            setPreview({ trayId: v.vp.tray.id, cultivarId: entry.id, scope: 'all', replace });
          } else if (aff.kind === 'row') {
            setPreview({ trayId: v.vp.tray.id, cultivarId: entry.id, scope: 'row', index: aff.row, replace });
          } else {
            setPreview({ trayId: v.vp.tray.id, cultivarId: entry.id, scope: 'col', index: aff.col, replace });
          }
          return;
        }
        const cell = hitTestCell(v.vp.tray, v.vp, sx, sy);
        if (cell) {
          const slot = v.vp.tray.slots[cell.row * v.vp.tray.cols + cell.col];
          // Hovering an occupied cell without shift: no putative will apply, so keep the ghost visible.
          if (slot.state === 'sown' && !replace) {
            setPreview(null);
            return;
          }
          setPreview({
            trayId: v.vp.tray.id,
            cultivarId: entry.id,
            scope: 'cell',
            row: cell.row,
            col: cell.col,
            replace,
          });
          return;
        }
        setPreview(null);
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
          useUiStore.getState().setSeedDragCultivarId(entry.id);
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
        useUiStore.getState().setSeedDragCultivarId(null);
        if (!dragging) return;

        const v = viewport();
        if (!v) return;
        const sx = ev.clientX - v.rect.left;
        const sy = ev.clientY - v.rect.top;

        const aff = hitTestDragSpreadAffordance(v.vp.tray, v.vp, sx, sy);
        if (aff) {
          const replace = ev.shiftKey;
          if (aff.kind === 'all') useGardenStore.getState().fillTray(v.vp.tray.id, entry.id, { replace });
          else if (aff.kind === 'row') useGardenStore.getState().fillRow(v.vp.tray.id, aff.row, entry.id, { replace });
          else useGardenStore.getState().fillColumn(v.vp.tray.id, aff.col, entry.id, { replace });
          return;
        }
        const hit = hitTestCell(v.vp.tray, v.vp, sx, sy);
        if (!hit) return;
        useGardenStore.getState().sowCell(v.vp.tray.id, hit.row, hit.col, entry.id, {
          replace: ev.shiftKey,
        });
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
      const raw = dragging.current === 'left' ? dragStartWidth.current + dx : dragStartWidth.current - dx;
      if (dragging.current === 'left') {
        setLeftWidth(Math.min(MAX_PANEL, Math.max(MIN_PANEL, raw)));
      } else {
        // Right sidebar can collapse fully: snap to 0 below MIN_PANEL/2.
        const snapped = raw < MIN_PANEL / 2 ? 0 : Math.min(MAX_PANEL, Math.max(MIN_PANEL, raw));
        if (snapped > 0) savedRightWidth.current = snapped;
        setRightWidth(snapped);
      }
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
        gridTemplateColumns: `${leftWidth}px 6px 1fr 6px ${rightWidth}px`,
        ['--left-panel-width' as string]: `${leftWidth + 6}px`,
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
    </div>
  );
}
