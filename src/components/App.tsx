import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasStack } from '../canvas/CanvasStack';
import { useActiveTheme } from '../hooks/useActiveTheme';
import { useGardenStore } from '../store/gardenStore';
import styles from '../styles/App.module.css';
import { autosave } from '../utils/file';
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

  const [draggingEntry, setDraggingEntry] = useState<PaletteEntry | null>(null);

  function handlePaletteDragStart(entry: PaletteEntry, e: React.DragEvent) {
    e.dataTransfer.setData('application/garden-object', JSON.stringify(entry));
    e.dataTransfer.effectAllowed = 'copy';
    // Minimize the default drag image — we show a custom ghost on the canvas
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
    e.dataTransfer.setDragImage(img, 0, 0);
    setDraggingEntry(entry);
  }

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
        <ObjectPalette
          onDragStart={handlePaletteDragStart}
          onDragEnd={() => setDraggingEntry(null)}
        />
      </div>
      <div
        className={`${styles.resizeHandle} ${styles.leftHandle}`}
        onMouseDown={(e) => handleResizeStart('left', e)}
      />
      <div className={styles.canvas}>
        <CanvasStack draggingEntry={draggingEntry} onDragEnd={() => setDraggingEntry(null)} />
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
