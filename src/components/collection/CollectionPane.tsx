import { useMemo, useState } from 'react';
import type { Cultivar, CultivarCategory } from '../../model/cultivars';
import styles from '../../styles/CollectionEditor.module.css';
import type { Side, TriState } from '../../hooks/useCollectionEditorState';
import { SpeciesGroup } from './SpeciesGroup';

const CATEGORY_LABELS: Record<CultivarCategory, string> = {
  vegetables: 'Vegetables',
  greens: 'Greens',
  fruits: 'Fruits',
  squash: 'Squash',
  'root-vegetables': 'Roots',
  legumes: 'Legumes',
  herbs: 'Herbs',
  flowers: 'Flowers',
};
const CATEGORY_ORDER: CultivarCategory[] = [
  'vegetables', 'greens', 'fruits', 'squash', 'root-vegetables', 'legumes', 'herbs', 'flowers',
];

interface Props {
  side: Side;
  title: string;
  source: Cultivar[];
  visibleCultivars: Cultivar[];
  search: string;
  onSearchChange: (v: string) => void;
  categories: Set<CultivarCategory>;
  onCategoriesChange: (next: Set<CultivarCategory>) => void;
  expandedSpecies: Set<string>;
  onSpeciesExpandToggle: (speciesId: string) => void;
  isChecked: (id: string) => boolean;
  onCultivarToggle: (id: string) => void;
  speciesTriState: (speciesId: string, visibleChildren: Cultivar[]) => TriState;
  onSpeciesToggle: (speciesId: string, visibleChildren: Cultivar[]) => void;
  onCultivarDragStart: (id: string, e: React.DragEvent) => void;
  onCultivarDragEnd: () => void;
  onDropFromOther: (draggedId: string) => void;
}

export function CollectionPane(props: Props) {
  const [dropActive, setDropActive] = useState(false);

  const groups = useMemo(() => {
    const bySpecies = new Map<string, Cultivar[]>();
    for (const c of props.visibleCultivars) {
      const list = bySpecies.get(c.speciesId) ?? [];
      list.push(c);
      bySpecies.set(c.speciesId, list);
    }
    return [...bySpecies.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [props.visibleCultivars]);

  function toggleCategory(cat: CultivarCategory) {
    const next = new Set(props.categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    props.onCategoriesChange(next);
  }

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
    const id = e.dataTransfer.getData('application/x-cultivar-id-from-other');
    if (id) props.onDropFromOther(id);
  }

  return (
    <div
      className={`${styles.pane} ${dropActive ? styles.dropTarget : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={styles.paneTitle}>{props.title}</div>
      <div className={styles.search}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search…"
          value={props.search}
          onChange={(e) => props.onSearchChange(e.target.value)}
        />
      </div>
      <div className={styles.chips}>
        {CATEGORY_ORDER.map((cat) => (
          <span
            key={cat}
            className={`${styles.chip} ${props.categories.has(cat) ? styles.chipActive : ''}`}
            onClick={() => toggleCategory(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </span>
        ))}
      </div>
      <div className={styles.list}>
        {groups.length === 0 && (
          <div className={styles.emptyMessage}>
            {props.source.length === 0 ? 'Empty' : 'No cultivars match'}
            {(props.search || props.categories.size > 0) && props.source.length > 0 && (
              <>
                {' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    props.onSearchChange('');
                    props.onCategoriesChange(new Set());
                  }}
                >clear filters</a>
              </>
            )}
          </div>
        )}
        {groups.map(([speciesId, children]) => (
          <SpeciesGroup
            key={speciesId}
            speciesId={speciesId}
            visibleChildren={children}
            expanded={props.expandedSpecies.has(speciesId)}
            triState={props.speciesTriState(speciesId, children)}
            isChecked={props.isChecked}
            onSpeciesToggle={() => props.onSpeciesToggle(speciesId, children)}
            onSpeciesExpandToggle={() => props.onSpeciesExpandToggle(speciesId)}
            onCultivarToggle={props.onCultivarToggle}
            onCultivarDragStart={props.onCultivarDragStart}
            onCultivarDragEnd={props.onCultivarDragEnd}
          />
        ))}
      </div>
    </div>
  );
}
