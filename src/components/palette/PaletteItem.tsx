import { useUiStore } from '../../store/uiStore';
import type { PaletteEntry } from './paletteData';
import styles from '../../styles/PaletteItem.module.css';

interface Props {
  entry: PaletteEntry;
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
}

export function PaletteItem({ entry, onDragStart }: Props) {
  const plottingTool = useUiStore((s) => s.plottingTool);
  const setPlottingTool = useUiStore((s) => s.setPlottingTool);
  const isActive = plottingTool?.type === entry.type && plottingTool?.category === entry.category;

  function handleClick() {
    if (entry.category === 'structures' || entry.category === 'zones') {
      if (isActive) {
        setPlottingTool(null);
      } else {
        setPlottingTool({ category: entry.category, type: entry.type, color: entry.color });
      }
    }
  }

  return (
    <div
      className={`${styles.item} ${isActive ? styles.active : ''}`}
      draggable
      onDragStart={(e) => onDragStart(entry, e)}
      onClick={handleClick}
    >
      <div className={styles.icon} style={{ backgroundColor: entry.color }} />
      <span className={styles.label}>{entry.name}</span>
    </div>
  );
}
