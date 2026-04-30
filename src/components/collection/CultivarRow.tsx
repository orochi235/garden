import type { Cultivar } from '../../model/cultivars';
import styles from '../../styles/CollectionEditor.module.css';

interface Props {
  cultivar: Cultivar;
  checked: boolean;
  onToggle: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export function CultivarRow({ cultivar, checked, onToggle, onDragStart, onDragEnd }: Props) {
  return (
    <div
      className={styles.cultivarRow}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
      />
      <span style={{ width: 14, height: 14, borderRadius: 3, background: cultivar.color, flexShrink: 0 }} />
      <span>{cultivar.variety ?? cultivar.name}</span>
    </div>
  );
}
