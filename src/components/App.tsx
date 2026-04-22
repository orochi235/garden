import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasStack } from '../canvas/CanvasStack';
import { useActiveTheme } from '../hooks/useActiveTheme';
import { createPlanting, createStructure, createZone } from '../model/types';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/App.module.css';
import { autosave } from '../utils/file';
import { screenToWorld, snapToGrid } from '../utils/grid';
import { getPlantingPosition } from '../utils/planting';
import { FpsMeter } from './FpsMeter';
import { MenuBar } from './MenuBar';
import { ObjectPalette } from './palette/ObjectPalette';
import type { PaletteEntry } from './palette/paletteData';
import { StatusBar } from './StatusBar';
import { Sidebar } from './sidebar/Sidebar';

const MIN_PANEL = 160;
const MAX_PANEL = 400;
const DEFAULT_PANEL = 240;

export function App() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);
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
      .catch(() => {});
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

      function getCanvasRect() {
        const el = document.querySelector('[data-canvas-container]') as HTMLElement | null;
        return el?.getBoundingClientRect() ?? null;
      }

      function updateOverlay(clientX: number, clientY: number) {
        const rect = getCanvasRect();
        if (!rect) return;
        const { panX, panY, zoom } = useUiStore.getState();
        const [worldX, worldY] = screenToWorld(
          clientX - rect.left,
          clientY - rect.top,
          { panX, panY, zoom },
        );
        const { garden } = useGardenStore.getState();
        const cellSize = garden.gridCellSizeFt;

        if (entry.category === 'structures') {
          const snappedX = snapToGrid(worldX - entry.defaultWidth / 2, cellSize);
          const snappedY = snapToGrid(worldY - entry.defaultHeight / 2, cellSize);
          const obj = createStructure({
            type: entry.type,
            x: snappedX,
            y: snappedY,
            width: entry.defaultWidth,
            height: entry.defaultHeight,
          });
          useUiStore.getState().setDragOverlay({
            layer: 'structures',
            objects: [obj],
            hideIds: [],
            snapped: true,
          });
        } else if (entry.category === 'zones') {
          const snappedX = snapToGrid(worldX - entry.defaultWidth / 2, cellSize);
          const snappedY = snapToGrid(worldY - entry.defaultHeight / 2, cellSize);
          const obj = createZone({
            x: snappedX,
            y: snappedY,
            width: entry.defaultWidth,
            height: entry.defaultHeight,
            color: entry.color,
            pattern: entry.pattern ?? null,
          });
          useUiStore.getState().setDragOverlay({
            layer: 'zones',
            objects: [obj],
            hideIds: [],
            snapped: true,
          });
        } else if (entry.category === 'plantings') {
          // Find a container under the cursor
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
            const obj = createPlanting({
              parentId: parent.id,
              x: pos.x,
              y: pos.y,
              cultivarId: entry.id,
            });
            useUiStore.getState().setDragOverlay({
              layer: 'plantings',
              objects: [obj],
              hideIds: [],
              snapped: true,
            });
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
        }
        updateOverlay(ev.clientX, ev.clientY);
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
        <ObjectPalette onDragBegin={handlePaletteDragBegin} />
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
