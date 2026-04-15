import { useState } from 'react';
import { paletteItems, categories, type PaletteEntry } from './paletteData';
import { PaletteItem } from './PaletteItem';
import { useActiveTheme } from '../../hooks/useActiveTheme';
import styles from '../../styles/ObjectPalette.module.css';

interface Props {
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
}

export function ObjectPalette({ onDragStart }: Props) {
  const [search, setSearch] = useState('');
  const theme = useActiveTheme();
  const filtered = search
    ? paletteItems.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    : paletteItems;

  return (
    <div className={styles.palette}>
      <div className={styles.search}>
        <input className={styles.searchInput} type="text" placeholder="Search objects..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {categories.map((cat) => {
        const items = filtered.filter((item) => item.category === cat.id);
        if (items.length === 0) return null;
        return (
          <div key={cat.id} className={styles.category}>
            <div className={styles.categoryLabel} style={{ color: theme.menuBarText }}>{cat.label}</div>
            <div className={styles.itemGrid}>
              {items.map((item) => (
                <PaletteItem key={item.id} entry={item} onDragStart={onDragStart} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
