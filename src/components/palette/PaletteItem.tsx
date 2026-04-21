import { useEffect, useRef } from 'react';
import { renderPlant } from '../../canvas/plantRenderers';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/PaletteItem.module.css';
import type { PaletteEntry } from './paletteData';

interface Props {
  entry: PaletteEntry;
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

const ICON_RADIUS = 28;

function PlantIcon({ name, color }: { name: string; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const size = 64;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    renderPlant(ctx, name, ICON_RADIUS, color);
    ctx.restore();
  }, [name, color]);

  return <canvas ref={canvasRef} className={styles.plantIcon} width={64} height={64} />;
}

export function PaletteItem({ entry, onDragStart, onDragEnd }: Props) {
  const plottingTool = useUiStore((s) => s.plottingTool);
  const setPlottingTool = useUiStore((s) => s.setPlottingTool);
  const viewMode = useUiStore((s) => s.viewMode);
  const isActive = viewMode === 'draw' && plottingTool?.id === entry.id;

  function handleClick() {
    if (entry.category === 'structures' || entry.category === 'zones') {
      if (isActive) {
        setPlottingTool(null);
      } else {
        setPlottingTool({
          id: entry.id,
          category: entry.category,
          type: entry.type,
          color: entry.color,
          pattern: entry.pattern,
        });
      }
    }
  }

  return (
    <div
      className={`${styles.item} ${isActive ? styles.active : ''}`}
      draggable
      onDragStart={(e) => onDragStart(entry, e)}
      onDragEnd={onDragEnd}
      onClick={handleClick}
    >
      {entry.category === 'plantings' ? (
        <>
          <PlantIcon name={entry.id} color={entry.color} />
          <span className={styles.label}>{entry.name}</span>
        </>
      ) : (
        <>
          <div className={styles.icon} style={{ backgroundColor: entry.color }} />
          <span className={styles.label}>{entry.name}</span>
        </>
      )}
    </div>
  );
}
