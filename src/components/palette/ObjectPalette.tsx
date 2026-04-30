import { useMemo, useState } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/ObjectPalette.module.css';
import {
  PaletteItem,
  PlantingLeafRow,
  PlantingParentRow,
  PlantingChildRow,
} from './PaletteItem';
import {
  buildPaletteItems,
  categories,
  type PaletteEntry,
} from './paletteData';
import { usePlantingTree } from './usePlantingTree';

interface Props {
  onDragBegin: (entry: PaletteEntry, e: React.PointerEvent) => void;
}

export function ObjectPalette({ onDragBegin }: Props) {
  const [search, setSearch] = useState('');
  const collection = useGardenStore((s) => s.garden.collection);
  const setEditorOpen = useUiStore((s) => s.setCollectionEditorOpen);
  const items = useMemo(() => buildPaletteItems(collection), [collection]);
  const filtered = search
    ? items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    : items;

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
          if (items.length === 0) {
            if (cat.id === 'plantings' && collection.length === 0 && !search) {
              return (
                <div key={cat.id} className={styles.category}>
                  <div className={styles.categoryLabel}>{cat.label}</div>
                  <div className={styles.emptyMessage}>
                    Your collection is empty.{' '}
                    <a href="#" onClick={(e) => { e.preventDefault(); setEditorOpen(true); }}>Edit Collection</a>
                  </div>
                </div>
              );
            }
            return null;
          }

          if (cat.id === 'plantings') {
            return (
              <div key={cat.id} className={styles.category}>
                <div className={styles.categoryLabel}>{cat.label}</div>
                <div className={styles.treeContainer}>
                  {tree.map((node) => {
                    if (node.kind === 'leaf') {
                      return (
                        <PlantingLeafRow
                          key={node.entry.id}
                          entry={node.entry}
                          onDragBegin={onDragBegin}
                        />
                      );
                    }
                    const isExpanded = expanded.has(node.speciesId);
                    return (
                      <div
                        key={node.speciesId}
                        className={`${styles.lozenge} ${isExpanded ? styles.lozengeExpanded : ''}`}
                      >
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
                              onDragBegin={onDragBegin}
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
              <div className={styles.categoryLabel}>{cat.label}</div>
              <div className={styles.itemGrid}>
                {items.map((item) => (
                  <PaletteItem
                    key={item.id}
                    entry={item}
                    onDragBegin={onDragBegin}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.editCollectionButton}
          onClick={() => setEditorOpen(true)}
        >
          Edit Collection…
        </button>
      </div>
    </div>
  );
}
