import { useMemo, useState, useCallback, useEffect } from 'react';
import type { PaletteEntry } from './paletteData';

export interface PlantingLeafNode {
  kind: 'leaf';
  speciesId: string;
  speciesName: string;
  entry: PaletteEntry;
}

export interface PlantingChildNode {
  entry: PaletteEntry;
}

export interface PlantingGroupNode {
  kind: 'group';
  speciesId: string;
  speciesName: string;
  /** The default species color (from first cultivar with variety === null, or first entry). */
  color: string;
  /** Cultivar ID to use for the parent row icon. */
  defaultCultivarId: string;
  children: PlantingChildNode[];
}

export type PlantingTreeNode = PlantingLeafNode | PlantingGroupNode;

export function buildPlantingTree(entries: PaletteEntry[]): PlantingTreeNode[] {
  const bySpecies = new Map<string, PaletteEntry[]>();
  for (const e of entries) {
    if (e.category !== 'plantings' || !e.speciesId) continue;
    const list = bySpecies.get(e.speciesId) ?? [];
    list.push(e);
    bySpecies.set(e.speciesId, list);
  }

  const nodes: PlantingTreeNode[] = [];
  for (const [speciesId, items] of bySpecies) {
    const speciesName = items[0].speciesName ?? speciesId;
    if (items.length === 1) {
      nodes.push({ kind: 'leaf', speciesId, speciesName, entry: items[0] });
    } else {
      const sorted = [...items].sort((a, b) =>
        (a.varietyLabel ?? '').localeCompare(b.varietyLabel ?? ''),
      );
      const defaultEntry = items.find((e) => e.varietyLabel === speciesName) ?? items[0];
      nodes.push({
        kind: 'group',
        speciesId,
        speciesName,
        color: defaultEntry.color,
        defaultCultivarId: defaultEntry.id,
        children: sorted.map((e) => ({ entry: e })),
      });
    }
  }

  nodes.sort((a, b) => a.speciesName.localeCompare(b.speciesName));
  return nodes;
}

export function usePlantingTree(plantingEntries: PaletteEntry[], isSearching: boolean) {
  const tree = useMemo(() => buildPlantingTree(plantingEntries), [plantingEntries]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-expand all groups when searching, collapse when search clears
  useEffect(() => {
    if (isSearching) {
      setExpanded(new Set(
        tree.filter((n) => n.kind === 'group').map((n) => n.speciesId),
      ));
    } else {
      setExpanded(new Set());
    }
  }, [isSearching, tree]);

  const toggle = useCallback((speciesId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(speciesId)) {
        next.delete(speciesId);
      } else {
        next.add(speciesId);
      }
      return next;
    });
  }, []);

  return { tree, expanded, toggle };
}
