import { useMemo, useState } from 'react';
import { useActiveTheme } from '../../hooks/useActiveTheme';
import styles from '../../styles/ObjectPalette.module.css';
import {
  PaletteItem,
  PlantingLeafRow,
  PlantingParentRow,
  PlantingChildRow,
} from './PaletteItem';
import {
  categories,
  type PaletteEntry,
  paletteItems,
} from './paletteData';
import { usePlantingTree } from './usePlantingTree';

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

  const plantingEntries = useMemo(
    () => filtered.filter((item) => item.category === 'plantings'),
    [filtered],
  );
  const { tree, expanded, toggle } = usePlantingTree(plantingEntries, search.length > 0);

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
                <div className={styles.treeContainer}>
                  {tree.map((node) => {
                    if (node.kind === 'leaf') {
                      return (
                        <PlantingLeafRow
                          key={node.entry.id}
                          entry={node.entry}
                          onDragStart={onDragStart}
                          onDragEnd={onDragEnd}
                        />
                      );
                    }
                    const isExpanded = expanded.has(node.speciesId);
                    return (
                      <div key={node.speciesId}>
                        <PlantingParentRow
                          node={node}
                          expanded={isExpanded}
                          onToggle={() => toggle(node.speciesId)}
                        />
                        {isExpanded &&
                          node.children.map((child) => (
                            <PlantingChildRow
                              key={child.entry.id}
                              entry={child.entry}
                              onDragStart={onDragStart}
                              onDragEnd={onDragEnd}
                            />
                          ))}
                      </div>
                    );
                  })}
                </div>
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
