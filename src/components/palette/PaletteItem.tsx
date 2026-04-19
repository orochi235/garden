import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/PaletteItem.module.css';
import type { PaletteEntry } from './paletteData';

interface Props {
  entry: PaletteEntry;
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
  onDragEnd?: () => void;
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
      <div className={styles.icon} style={{ backgroundColor: entry.color }} />
      <span className={styles.label}>{entry.name}</span>
    </div>
  );
}
