import { useEffect, useRef } from 'react';
import { renderIcon } from '../../canvas/plantRenderers';
import { getCultivar } from '../../model/cultivars';
import type { IconType } from '../../model/species';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/PaletteItem.module.css';
import type { PaletteEntry } from './paletteData';
import type { PlantingGroupNode } from './usePlantingTree';

interface Props {
  entry: PaletteEntry;
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

const ICON_RADIUS = 28;

function PlantIcon({ cultivarId, color }: { cultivarId: string; color: string }) {
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
    const cultivar = getCultivar(cultivarId);
    const iconType: IconType = cultivar?.icon ?? 'herb-sprig';
    renderIcon(ctx, iconType, ICON_RADIUS, color);
    ctx.restore();
  }, [cultivarId, color]);

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
          <PlantIcon cultivarId={entry.id} color={entry.color} />
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

const SMALL_ICON_RADIUS = 14;

function SmallPlantIcon({ cultivarId, color }: { cultivarId: string; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const size = 32;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    const cultivar = getCultivar(cultivarId);
    const iconType: IconType = cultivar?.icon ?? 'herb-sprig';
    renderIcon(ctx, iconType, SMALL_ICON_RADIUS, color);
    ctx.restore();
  }, [cultivarId, color]);

  return <canvas ref={canvasRef} className={styles.rowPlantIcon} width={32} height={32} />;
}

function DisclosureTriangle({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 10 10"
      className={`${styles.disclosureIcon}${expanded ? ` ${styles.disclosureExpanded}` : ''}`}
    >
      <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface LeafRowProps {
  entry: PaletteEntry;
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export function PlantingLeafRow({ entry, onDragStart, onDragEnd }: LeafRowProps) {
  return (
    <div
      className={styles.row}
      draggable
      onDragStart={(e) => onDragStart(entry, e)}
      onDragEnd={onDragEnd}
    >
      <div className={styles.rowDisclosure} />
      <div className={styles.rowIconCol}>
        <SmallPlantIcon cultivarId={entry.id} color={entry.color} />
      </div>
      <span className={styles.rowLabel}>{entry.speciesName ?? entry.name}</span>
    </div>
  );
}

interface ParentRowProps {
  node: PlantingGroupNode;
  expanded: boolean;
  onToggle: () => void;
}

export function PlantingParentRow({ node, expanded, onToggle }: ParentRowProps) {
  return (
    <div
      className={`${styles.row} ${styles.rowParent}`}
      onClick={onToggle}
    >
      <div className={styles.rowDisclosure}>
        <DisclosureTriangle expanded={expanded} />
      </div>
      <div className={styles.rowIconCol}>
        <SmallPlantIcon cultivarId={node.defaultCultivarId} color={node.color} />
      </div>
      <span className={styles.rowLabel}>{node.speciesName}</span>
    </div>
  );
}

interface ChildRowProps {
  entry: PaletteEntry;
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export function PlantingChildRow({ entry, onDragStart, onDragEnd }: ChildRowProps) {
  return (
    <div
      className={`${styles.row} ${styles.rowChild}`}
      draggable
      onDragStart={(e) => onDragStart(entry, e)}
      onDragEnd={onDragEnd}
    >
      <div className={styles.rowColorDot} style={{ backgroundColor: entry.color }} />
      <span className={styles.rowLabel}>{entry.varietyLabel ?? entry.name}</span>
    </div>
  );
}
