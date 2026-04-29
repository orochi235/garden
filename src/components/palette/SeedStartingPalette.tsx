import { useMemo, useState } from 'react';
import { useActiveTheme } from '../../hooks/useActiveTheme';
import { passesAlmanacFilters } from '../../model/almanacFilter';
import { getAllCultivars, type CultivarCategory } from '../../model/cultivars';
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

/** Build PaletteEntry list of cultivars whose resolved seedStarting.startable === true. */
function buildSeedablePaletteEntries(filters: AlmanacFilters): PaletteEntry[] {
  const entries: PaletteEntry[] = [];
  for (const c of getAllCultivars()) {
    const species = getSpecies(c.speciesId);
    const resolved = resolveSeedStarting(species?.seedStarting, c.seedStarting);
    if (!resolved.startable) continue;
    if (!passesAlmanacFilters(c, species, filters)) continue;
    entries.push({
      id: c.id,
      name: c.name,
      category: 'plantings',
      speciesId: c.speciesId,
      speciesName: species?.name ?? c.speciesId,
      varietyLabel: c.variety ?? c.name,
      type: 'planting',
      defaultWidth: 0,
      defaultHeight: 0,
      color: c.color,
    });
  }
  return entries;
}

export function SeedStartingPalette({ onDragBegin }: Props) {
  const [search, setSearch] = useState('');
  const { theme, transitionDuration: dur } = useActiveTheme();
  const addTray = useGardenStore((s) => s.addTray);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);
  const almanacFilters = useUiStore((s) => s.almanacFilters);

  const seedables = useMemo(() => buildSeedablePaletteEntries(almanacFilters), [almanacFilters]);
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
      <div className={styles.search}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search seedables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className={styles.scrollArea}>
        <div className={styles.category}>
          <div
            className={styles.categoryLabel}
            style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}
          >
            Trays
          </div>
          <div
            className={styles.treeContainer}
            style={{ '--list-hover': theme.listHover } as React.CSSProperties}
          >
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

        {tree.length === 0 && (
          <div className={styles.category}>
            <div className={styles.emptyMessage}>No seedable cultivars</div>
          </div>
        )}
        {treeByCategory.map(({ category, nodes }) => (
          <div key={category} className={styles.category}>
            <div
              className={styles.categoryLabel}
              style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}
            >
              {CATEGORY_LABELS[category]}
            </div>
            <div
              className={styles.treeContainer}
              style={{ '--list-hover': theme.listHover } as React.CSSProperties}
            >
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
    </div>
  );
}
