import { useMemo, useState } from 'react';
import { passesAlmanacFilters } from '../../model/almanacFilter';
import type { Cultivar, CultivarCategory } from '../../model/cultivars';
import { resolveSeedStarting } from '../../model/floraSeedStarting';
import { getSpecies } from '../../model/species';
import { instantiatePreset, TRAY_CATALOG } from '../../model/trayCatalog';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore, type AlmanacFilters } from '../../store/uiStore';
import styles from '../../styles/ObjectPalette.module.css';
import {
  PlantingChildRow,
  PlantingLeafRow,
  PlantingParentRow,
} from './PaletteItem';
import type { PaletteEntry } from './paletteData';
import { usePlantingTree } from './usePlantingTree';

const CATEGORY_ORDER: CultivarCategory[] = [
  'vegetables',
  'greens',
  'fruits',
  'squash',
  'root-vegetables',
  'legumes',
  'herbs',
  'flowers',
];

const CATEGORY_LABELS: Record<CultivarCategory, string> = {
  vegetables: 'Vegetables',
  greens: 'Greens',
  fruits: 'Fruits',
  squash: 'Squash',
  'root-vegetables': 'Root Vegetables',
  legumes: 'Legumes',
  herbs: 'Herbs',
  flowers: 'Flowers',
};

interface Props {
  /** Drag handler for cultivar items. Task 15 will wire actual drop logic. */
  onDragBegin: (entry: PaletteEntry, e: React.PointerEvent) => void;
}

/** Build PaletteEntry list of cultivars whose resolved seedStarting.startable === true.
 *  When `showAll` is true, the startable gate AND the almanac filters are skipped — every
 *  cultivar in the collection appears. */
function buildSeedablePaletteEntries(
  cultivars: Cultivar[],
  filters: AlmanacFilters,
  showAll: boolean,
): PaletteEntry[] {
  const entries: PaletteEntry[] = [];
  for (const c of cultivars) {
    const species = getSpecies(c.speciesId);
    if (!showAll) {
      const resolved = resolveSeedStarting(species?.seedStarting, c.seedStarting);
      if (!resolved.startable) continue;
      if (!passesAlmanacFilters(c, species, filters)) continue;
    }
    entries.push({
      id: c.id,
      name: c.name,
      category: 'plantings',
      speciesId: c.speciesId,
      speciesName: species?.name ?? c.speciesId,
      varietyLabel: c.variety ?? c.name,
      type: 'planting',
      defaultWidth: 0,
      defaultLength: 0,
      color: c.color,
    });
  }
  return entries;
}

export function NurseryPalette({ onDragBegin }: Props) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const addTray = useGardenStore((s) => s.addTray);
  const collection = useGardenStore((s) => s.garden.collection);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);
  const setEditorOpen = useUiStore((s) => s.setCollectionEditorOpen);
  const almanacFilters = useUiStore((s) => s.almanacFilters);

  const seedables = useMemo(
    () => buildSeedablePaletteEntries(collection, almanacFilters, showAll),
    [collection, almanacFilters, showAll],
  );
  const filtered = useMemo(() => {
    if (!search) return seedables;
    const q = search.toLowerCase();
    return seedables.filter((e) => e.name.toLowerCase().includes(q));
  }, [seedables, search]);

  const { tree, expanded, toggle } = usePlantingTree(filtered, search.length > 0);

  const treeByCategory = useMemo(() => {
    const groups = new Map<CultivarCategory, typeof tree>();
    for (const node of tree) {
      const cat = (getSpecies(node.speciesId)?.category ?? 'vegetables') as CultivarCategory;
      const list = groups.get(cat) ?? [];
      list.push(node);
      groups.set(cat, list);
    }
    return CATEGORY_ORDER
      .filter((cat) => groups.has(cat))
      .map((cat) => ({ category: cat, nodes: groups.get(cat)! }));
  }, [tree]);

  function handleAddTray(presetId: string) {
    const tray = instantiatePreset(presetId);
    if (!tray) return;
    addTray(tray);
    setCurrentTrayId(tray.id);
  }

  return (
    <div className={styles.palette}>
      <div className={styles.category}>
        <div className={styles.categoryLabel}>Trays</div>
        <div className={styles.treeContainer}>
          {TRAY_CATALOG.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.trayButton}
              onClick={() => handleAddTray(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <hr style={{ border: 0, borderTop: '1px solid rgba(255,255,255,0.12)', margin: '8px 0' }} />
      <div className={styles.search}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search seedables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            fontSize: 12,
            color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show all cultivars
        </label>
      </div>
      <div className={styles.scrollArea}>
        {tree.length === 0 && (
          <div className={styles.category}>
            <div className={styles.emptyMessage}>
              {collection.length === 0 ? (
                <>
                  Your collection is empty.{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); setEditorOpen(true); }}>Edit Collection</a>
                </>
              ) : (
                'No seedable cultivars in your collection'
              )}
            </div>
          </div>
        )}
        {treeByCategory.map(({ category, nodes }) => (
          <div key={category} className={styles.category}>
            <div className={styles.categoryLabel}>{CATEGORY_LABELS[category]}</div>
            <div className={styles.treeContainer}>
              {nodes.map((node) => {
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
                      onDragBegin={onDragBegin}
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
        ))}
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
