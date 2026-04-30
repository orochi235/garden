import { useMemo, useState } from 'react';
import type { Cultivar } from '../../model/cultivars';
import { getSpecies } from '../../model/species';
import styles from '../../styles/CollectionEditor.module.css';

interface Props {
  collection: Cultivar[];
  onRemove: (id: string) => void;
  onDropFromOther: (draggedIds: string[]) => void;
}

export function CollectionList({ collection, onRemove, onDropFromOther }: Props) {
  const [dropActive, setDropActive] = useState(false);

  const groups = useMemo(() => {
    const bySpecies = new Map<string, Cultivar[]>();
    for (const c of collection) {
      const list = bySpecies.get(c.speciesId) ?? [];
      list.push(c);
      bySpecies.set(c.speciesId, list);
    }
    return [...bySpecies.entries()]
      .map(([speciesId, children]) => ({
        speciesId,
        speciesName: getSpecies(speciesId)?.name ?? speciesId,
        children: [...children].sort((a, b) => (a.variety ?? a.name).localeCompare(b.variety ?? b.name)),
      }))
      .sort((a, b) => a.speciesName.localeCompare(b.speciesName));
  }, [collection]);

  function handleDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('application/x-cultivar-id-from-other')) {
      e.preventDefault();
      setDropActive(true);
    }
  }
  function handleDragLeave() {
    setDropActive(false);
  }
  function handleDrop(e: React.DragEvent) {
    setDropActive(false);
    const raw = e.dataTransfer.getData('application/x-cultivar-id-from-other');
    if (!raw) return;
    const ids = raw.split(',').filter(Boolean);
    if (ids.length > 0) onDropFromOther(ids);
  }

  return (
    <div
      className={`${styles.collectionList} ${dropActive ? styles.dropTarget : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {collection.length === 0 && (
        <div className={styles.emptyMessage}>Empty</div>
      )}
      {groups.map((g) => (
        <div key={g.speciesId} className={styles.collectionGroup}>
          <div className={styles.collectionGroupTitle}>{g.speciesName}</div>
          {g.children.map((c) => (
            <div key={c.id} className={styles.collectionPill}>
              <span className={styles.swatch} style={{ background: c.color }} />
              <span className={styles.collectionPillName}>{c.variety ?? c.name}</span>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => onRemove(c.id)}
                title="Remove from collection"
              >×</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
