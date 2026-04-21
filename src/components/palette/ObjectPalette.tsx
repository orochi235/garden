import { useState } from 'react';
import { useActiveTheme } from '../../hooks/useActiveTheme';
import styles from '../../styles/ObjectPalette.module.css';
import { PaletteItem } from './PaletteItem';
import {
  categories,
  cultivarCategoryLabels,
  cultivarCategoryOrder,
  type PaletteEntry,
  paletteItems,
} from './paletteData';

interface Props {
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export function ObjectPalette({ onDragStart, onDragEnd }: Props) {
  const [search, setSearch] = useState('');
  const { theme, transitionDuration: dur } = useActiveTheme();
  const filtered = search
    ? paletteItems.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    : paletteItems;

  return (
    <div className={styles.palette}>
      <div className={styles.search}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search objects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className={styles.scrollArea}>
      {categories.map((cat) => {
        const items = filtered.filter((item) => item.category === cat.id);
        if (items.length === 0) return null;

        if (cat.id === 'plantings') {
          return (
            <div key={cat.id} className={styles.category}>
              <div
                className={styles.categoryLabel}
                style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}
              >
                {cat.label}
              </div>
              {cultivarCategoryOrder.map((subcat) => {
                const subItems = items.filter((item) => item.subcategory === subcat);
                if (subItems.length === 0) return null;
                return (
                  <div key={subcat} className={styles.subcategory}>
                    <div
                      className={styles.subcategoryLabel}
                      style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}
                    >
                      {cultivarCategoryLabels[subcat]}
                    </div>
                    <div className={styles.itemGrid}>
                      {subItems.map((item) => (
                        <PaletteItem
                          key={item.id}
                          entry={item}
                          onDragStart={onDragStart}
                          onDragEnd={onDragEnd}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        return (
          <div key={cat.id} className={styles.category}>
            <div
              className={styles.categoryLabel}
              style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}
            >
              {cat.label}
            </div>
            <div className={styles.itemGrid}>
              {items.map((item) => (
                <PaletteItem
                  key={item.id}
                  entry={item}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              ))}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
