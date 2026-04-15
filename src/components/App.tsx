import { useEffect } from 'react';
import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { CanvasStack } from '../canvas/CanvasStack';
import { ObjectPalette } from './palette/ObjectPalette';
import { Sidebar } from './sidebar/Sidebar';
import type { PaletteEntry } from './palette/paletteData';
import { useGardenStore } from '../store/gardenStore';
import { autosave, loadAutosave } from '../utils/file';
import styles from '../styles/App.module.css';

export function App() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);

  useEffect(() => {
    const saved = loadAutosave();
    if (saved) loadGarden(saved);
  }, [loadGarden]);

  useEffect(() => {
    autosave(garden);
  }, [garden]);

  function handlePaletteDragStart(entry: PaletteEntry, e: React.DragEvent) {
    e.dataTransfer.setData('application/garden-object', JSON.stringify(entry));
    e.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <div className={styles.layout}>
      <div className={styles.menu}><MenuBar /></div>
      <div className={styles.palette}><ObjectPalette onDragStart={handlePaletteDragStart} /></div>
      <div className={styles.canvas}><CanvasStack /></div>
      <div className={styles.sidebar}><Sidebar /></div>
      <div className={styles.status}><StatusBar /></div>
    </div>
  );
}
