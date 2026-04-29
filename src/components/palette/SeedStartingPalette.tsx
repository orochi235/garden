import { useMemo, useState } from 'react';
import { useActiveTheme } from '../../hooks/useActiveTheme';
import { getAllCultivars } from '../../model/cultivars';
import { resolveSeedStarting } from '../../model/floraSeedStarting';
import { getSpecies } from '../../model/species';
import { instantiatePreset, TRAY_CATALOG } from '../../model/trayCatalog';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/ObjectPalette.module.css';
import {
  PlantingChildRow,
  PlantingLeafRow,
  PlantingParentRow,
} from './PaletteItem';
import type { PaletteEntry } from './paletteData';
import { usePlantingTree } from './usePlantingTree';

interface Props {
  /** Drag handler for cultivar items. Task 15 will wire actual drop logic. */
  onDragBegin: (entry: PaletteEntry, e: React.PointerEvent) => void;
}

/** Build PaletteEntry list of cultivars whose resolved seedStarting.startable === true. */
function buildSeedablePaletteEntries(): PaletteEntry[] {
  const entries: PaletteEntry[] = [];
  for (const c of getAllCultivars()) {
    const species = getSpecies(c.speciesId);
    const resolved = resolveSeedStarting(species?.seedStarting, c.seedStarting);
    if (!resolved.startable) continue;
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

  const seedables = useMemo(() => buildSeedablePaletteEntries(), []);
  const filtered = useMemo(() => {
    if (!search) return seedables;
    const q = search.toLowerCase();
    return seedables.filter((e) => e.name.toLowerCase().includes(q));
  }, [seedables, search]);

  const { tree, expanded, toggle } = usePlantingTree(filtered, search.length > 0);

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

        <div className={styles.category}>
          <div
            className={styles.categoryLabel}
            style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}
          >
            Seedables
          </div>
          <div
            className={styles.treeContainer}
            style={{ '--list-hover': theme.listHover } as React.CSSProperties}
          >
            {tree.length === 0 && (
              <div className={styles.emptyMessage}>No seedable cultivars</div>
            )}
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
      </div>
    </div>
  );
}
