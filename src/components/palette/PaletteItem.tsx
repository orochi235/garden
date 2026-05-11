import { useEffect, useRef, useState } from 'react';
import { onIconLoad, renderIcon } from '../../canvas/plantRenderers';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/PaletteItem.module.css';
import type { PaletteEntry } from './paletteData';
import type { PlantingGroupNode } from './usePlantingTree';

interface Props {
  entry: PaletteEntry;
  onDragBegin: (entry: PaletteEntry, e: React.PointerEvent) => void;
}

const ICON_RADIUS = 28;

function PlantIcon({ cultivarId, color }: { cultivarId: string; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => onIconLoad(() => setTick((t) => t + 1)), []);

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
    renderIcon(ctx, cultivarId, ICON_RADIUS, color);
    ctx.restore();
  }, [cultivarId, color, tick]);

  return <canvas ref={canvasRef} className={styles.plantIcon} width={64} height={64} />;
}

export function PaletteItem({ entry, onDragBegin }: Props) {
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
      onPointerDown={(e) => { if (e.button === 0) onDragBegin(entry, e); }}
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

const SMALL_ICON_RADIUS = 18;

function SmallPlantIcon({ cultivarId, color }: { cultivarId: string; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => onIconLoad(() => setTick((t) => t + 1)), []);

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
    renderIcon(ctx, cultivarId, SMALL_ICON_RADIUS, color);
    ctx.restore();
  }, [cultivarId, color, tick]);

  return <canvas ref={canvasRef} className={styles.rowPlantIcon} width={32} height={32} />;
}

interface LeafRowProps {
  entry: PaletteEntry;
  onDragBegin: (entry: PaletteEntry, e: React.PointerEvent) => void;
}

export function PlantingLeafRow({ entry, onDragBegin }: LeafRowProps) {
  const appMode = useUiStore((s) => s.appMode);
  const armedCultivarId = useUiStore((s) => s.armedCultivarId);
  const setArmedCultivarId = useUiStore((s) => s.setArmedCultivarId);
  const armed = appMode === 'nursery' && armedCultivarId === entry.id;
  return (
    <div
      className={`${styles.row} ${armed ? styles.rowArmed : ''}`}
      onPointerDown={(e) => { if (e.button === 0) onDragBegin(entry, e); }}
      onClick={() => {
        if (appMode !== 'nursery') return;
        setArmedCultivarId(armedCultivarId === entry.id ? null : entry.id);
      }}
    >
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
  onDragBegin?: (entry: PaletteEntry, e: React.PointerEvent) => void;
}

export function PlantingParentRow({ node, expanded: _, onToggle, onDragBegin }: ParentRowProps) {
  return (
    <div
      className={`${styles.row} ${styles.rowParent}`}
      onPointerDown={(e) => {
        if (e.button !== 0 || !onDragBegin) return;
        const target = e.currentTarget as HTMLElement & { __dragged?: boolean };
        target.__dragged = false;
        onDragBegin(node.defaultEntry, e);
      }}
      onClick={(e) => {
        const target = e.currentTarget as HTMLElement & { __dragged?: boolean };
        if (target.__dragged) {
          target.__dragged = false;
          return;
        }
        onToggle();
      }}
    >
      <div className={styles.rowIconCol}>
        <SmallPlantIcon cultivarId={node.defaultCultivarId} color={node.color} />
      </div>
      <span className={`${styles.rowLabel} ${styles.rowLabelBold}`}>{node.speciesName}</span>
    </div>
  );
}

interface ChildRowProps {
  entry: PaletteEntry;
  onDragBegin: (entry: PaletteEntry, e: React.PointerEvent) => void;
}

export function PlantingChildRow({ entry, onDragBegin }: ChildRowProps) {
  const appMode = useUiStore((s) => s.appMode);
  const armedCultivarId = useUiStore((s) => s.armedCultivarId);
  const setArmedCultivarId = useUiStore((s) => s.setArmedCultivarId);
  const armed = appMode === 'nursery' && armedCultivarId === entry.id;
  return (
    <div
      className={`${styles.row} ${styles.rowChild} ${armed ? styles.rowArmed : ''}`}
      onPointerDown={(e) => { if (e.button === 0) onDragBegin(entry, e); }}
      onClick={() => {
        if (appMode !== 'nursery') return;
        setArmedCultivarId(armedCultivarId === entry.id ? null : entry.id);
      }}
    >
      <div className={styles.rowIconCol}>
        <SmallPlantIcon cultivarId={entry.id} color={entry.color} />
      </div>
      <span className={styles.rowLabel}>{entry.varietyLabel ?? entry.name}</span>
    </div>
  );
}
