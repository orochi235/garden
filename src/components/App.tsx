import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKeyboardActionDispatch } from '../actions/useKeyboardActionDispatch';
import { CanvasNewPrototype } from '../canvas/CanvasNewPrototype';
import { createInsertAdapter } from '../canvas/adapters/insert';
import { onIconLoad, renderPlant } from '../canvas/plantRenderers';
import { getTrayDropTargets, hitTrayDropTarget } from '../canvas/layouts/trayDropTargets';
import {
  seedStartingWorldBounds,
  trayWorldOrigin,
} from '../canvas/adapters/seedStartingScene';
import { createDragGhost, useClipboard } from '@orochi235/weasel';
import { startThresholdDrag } from '@orochi235/weasel';
import { useActiveTheme } from '../hooks/useActiveTheme';
import { createPlanting, createStructure, createZone } from '../model/types';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/App.module.css';
import { enterSeedStarting } from '../utils/enterSeedStarting';
import { autosave, loadPersistedCollection } from '../utils/file';
import type { Cultivar } from '../model/cultivars';
import { WelcomeModal } from './WelcomeModal';
import { screenToWorld, roundToCell } from '@orochi235/weasel';
import { getPlantingPosition } from '../utils/planting';
import { MenuBar } from './MenuBar';
import { ObjectPalette } from './palette/ObjectPalette';
import type { PaletteEntry } from './palette/paletteData';
import { SeedStartingPalette } from './palette/SeedStartingPalette';
import { StatusBar } from './StatusBar';
import { Sidebar } from './sidebar/Sidebar';
import { ViewToolbar } from './ViewToolbar';
import { LayerSelector } from './LayerSelector';

const MIN_PANEL = 160;
const MIN_LEFT_PANEL = 200;
const MAX_PANEL = 400;
const DEFAULT_PANEL = 240;

const INITIAL_SEARCH =
  typeof window === 'undefined' ? '' : window.location.search;
const INITIAL_PARAMS = new URLSearchParams(INITIAL_SEARCH);
const INITIAL_MODE_PARAM = INITIAL_PARAMS.get('mode');

export function App() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);
  const setCollection = useGardenStore((s) => s.setCollection);
  const appMode = useUiStore((s) => s.appMode);
  const [showWelcome, setShowWelcome] = useState(false);
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
        if (INITIAL_MODE_PARAM === 'seed-starting') enterSeedStarting();
        const persisted = loadPersistedCollection<Cultivar[]>();
        if (persisted && persisted.length > 0) {
          setCollection(persisted);
        } else if (
          (useGardenStore.getState().garden.collection ?? []).length === 0 &&
          INITIAL_PARAMS.toString() === ''
        ) {
          setShowWelcome(true);
        }
      });
  }, [loadGarden, setCollection]);

  useEffect(() => {
    autosave(garden);
  }, [garden]);

  const insertAdapter = useMemo(() => createInsertAdapter(), []);
  const clipboard = useClipboard(insertAdapter, {
    getSelection: () => useUiStore.getState().selectedIds,
    onPaste: (newIds) => useUiStore.getState().setSelection(newIds),
  });
  const actionCtx = useMemo(() => ({ clipboard }), [clipboard]);
  useKeyboardActionDispatch(actionCtx);

  const handlePaletteDragBegin = useCallback(
    (entry: PaletteEntry, e: React.PointerEvent) => {
      let transientObj: ReturnType<typeof createStructure> | ReturnType<typeof createZone> | ReturnType<typeof createPlanting> | null = null;
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

      startThresholdDrag(e, {
        onActivate: (ev) => {
          ensureGhost().move(ev.clientX, ev.clientY);
          createTransientObject(ev.clientX, ev.clientY);
          ghost?.setHidden(useUiStore.getState().dragOverlay != null);
        },
        onMove: (ev) => {
          ensureGhost().move(ev.clientX, ev.clientY);
          updateOverlayPosition(ev.clientX, ev.clientY);
          ghost?.setHidden(useUiStore.getState().dragOverlay != null);
        },
        onCommit: (ev) => {
          clearGhost();
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

        useUiStore.getState().clearDragOverlay();
        },
        onCancel: () => {
          clearGhost();
          useUiStore.getState().clearDragOverlay();
        },
      });
    },
    [],
  );

  const handleSeedDragBegin = useCallback(
    (entry: PaletteEntry, e: React.PointerEvent) => {
      if (entry.category !== 'plantings') return;
      let lastClientX = e.clientX;
      let lastClientY = e.clientY;
      let shiftHeld = false;

      // Returns a viewport for the multi-tray seed-starting world. `toWorld`
      // maps client coords to world inches; `pickTray(world)` finds the tray
      // under the cursor (or falls back to the current tray); `toLocal`
      // converts world inches to tray-local inches for cell hit-tests.
      function viewport() {
        const el = document.querySelector('[data-canvas-container]') as HTMLElement | null;
        const rect = el?.getBoundingClientRect();
        if (!rect) return null;
        const ui = useUiStore.getState();
        if (ui.appMode !== 'seed-starting') return null;
        const garden = useGardenStore.getState().garden;
        const ss = garden.seedStarting;
        const bounds = seedStartingWorldBounds(ss);
        const ppi = ui.seedStartingZoom;
        const originX = (rect.width - bounds.width * ppi) / 2 + ui.seedStartingPanX;
        const originY = (rect.height - bounds.height * ppi) / 2 + ui.seedStartingPanY;
        const toWorld = (clientX: number, clientY: number) => ({
          x: (clientX - rect.left - originX) / ppi,
          y: (clientY - rect.top - originY) / ppi,
        });
        const pickTray = (world: { x: number; y: number }) => {
          // Hit-test trays at the cursor; fall back to current tray for off-tray drops.
          for (const t of ss.trays) {
            const o = trayWorldOrigin(t, ss);
            if (
              world.x >= o.x &&
              world.y >= o.y &&
              world.x < o.x + t.widthIn &&
              world.y < o.y + t.heightIn
            ) {
              return t;
            }
          }
          return ss.trays.find((t) => t.id === ui.currentTrayId) ?? null;
        };
        const toLocal = (world: { x: number; y: number }, tray: typeof ss.trays[number]) => {
          const o = trayWorldOrigin(tray, ss);
          return { x: world.x - o.x, y: world.y - o.y };
        };
        const currentTray = ss.trays.find((t) => t.id === ui.currentTrayId) ?? null;
        return { rect, currentTray, toWorld, pickTray, toLocal };
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

      function updateFillPreview() {
        const set = useUiStore.getState().setSeedFillPreview;
        const setPreview = (preview: Parameters<typeof set>[0]) => {
          set(preview);
          setGhostHidden(preview != null);
        };
        const v = viewport();
        if (!v) {
          setPreview(null);
          return;
        }
        const w = v.toWorld(lastClientX, lastClientY);
        const tray = v.pickTray(w);
        if (!tray) {
          setPreview(null);
          return;
        }
        const local = v.toLocal(w, tray);

        const replace = shiftHeld;
        const hit = hitTrayDropTarget(getTrayDropTargets(tray), local);
        if (!hit) {
          setPreview(null);
          return;
        }
        const m = hit.meta;
        const base = { trayId: tray.id, cultivarId: entry.id, replace };
        if (m.kind === 'all') {
          setPreview({ ...base, scope: 'all' });
        } else if (m.kind === 'row') {
          setPreview({ ...base, scope: 'row', index: m.row });
        } else if (m.kind === 'col') {
          setPreview({ ...base, scope: 'col', index: m.col });
        } else {
          const slot = tray.slots[m.row * tray.cols + m.col];
          if (slot.state === 'sown' && !replace) {
            setPreview(null);
            return;
          }
          setPreview({ ...base, scope: 'cell', row: m.row, col: m.col });
        }
      }

      function onKey(ev: KeyboardEvent) {
        if (ev.key !== 'Shift') return;
        shiftHeld = ev.type === 'keydown';
        updateFillPreview();
      }

      startThresholdDrag(e, {
        onActivate: (ev) => {
          useUiStore.getState().setSeedDragCultivarId(entry.id);
          document.addEventListener('keydown', onKey);
          document.addEventListener('keyup', onKey);
          moveGhost(ev.clientX, ev.clientY);
          updateFillPreview();
        },
        onMove: (ev) => {
          lastClientX = ev.clientX;
          lastClientY = ev.clientY;
          shiftHeld = ev.shiftKey;
          moveGhost(ev.clientX, ev.clientY);
          updateFillPreview();
        },
        onCommit: (ev) => {
          document.removeEventListener('keydown', onKey);
          document.removeEventListener('keyup', onKey);
          clearGhost();
          useUiStore.getState().setSeedFillPreview(null);
          useUiStore.getState().setSeedDragCultivarId(null);

          const v = viewport();
          if (!v) return;
          const w = v.toWorld(ev.clientX, ev.clientY);
          const tray = v.pickTray(w);
          if (!tray) return;
          const local = v.toLocal(w, tray);

          const hit = hitTrayDropTarget(getTrayDropTargets(tray), local);
          if (!hit) return;
          const m = hit.meta;
          const replace = ev.shiftKey;
          const gs = useGardenStore.getState();
          if (m.kind === 'all') {
            gs.fillTray(tray.id, entry.id, { replace });
            return;
          }
          if (m.kind === 'row') {
            gs.fillRow(tray.id, m.row, entry.id, { replace });
            return;
          }
          if (m.kind === 'col') {
            gs.fillColumn(tray.id, m.col, entry.id, { replace });
            return;
          }
          gs.sowCell(tray.id, m.row, m.col, entry.id, {
            replace: ev.shiftKey,
          });
        },
        onCancel: () => {
          document.removeEventListener('keydown', onKey);
          document.removeEventListener('keyup', onKey);
          clearGhost();
          useUiStore.getState().setSeedFillPreview(null);
          useUiStore.getState().setSeedDragCultivarId(null);
        },
      });
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
        setLeftWidth(Math.min(MAX_PANEL, Math.max(MIN_LEFT_PANEL, raw)));
      } else {
        // Right sidebar can collapse fully: snap to 0 below MIN_PANEL/2.
        // Cap at DEFAULT_PANEL — the right panel can't grow past its initial size.
        const snapped = raw < MIN_PANEL / 2 ? 0 : Math.min(DEFAULT_PANEL, Math.max(MIN_PANEL, raw));
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
        ['--theme-menu-text' as string]: theme.menuBarText,
        ['--theme-menu-title' as string]: theme.menuBarTitle,
        ['--theme-list-hover' as string]: theme.listHover,
        ['--theme-transition' as string]: `${transitionDuration} ease`,
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
        <CanvasNewPrototype />
        <ViewToolbar />
        <LayerSelector />
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
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
    </div>
  );
}
