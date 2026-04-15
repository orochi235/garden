import type { PaletteEntry } from './paletteData';
import styles from '../../styles/PaletteItem.module.css';

interface Props {
  entry: PaletteEntry;
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
}

export function PaletteItem({ entry, onDragStart }: Props) {
  return (
    <div className={styles.item} draggable onDragStart={(e) => onDragStart(entry, e)}>
      <div className={styles.swatch} style={{ backgroundColor: entry.color }} />
      <span>{entry.name}</span>
    </div>
  );
}
