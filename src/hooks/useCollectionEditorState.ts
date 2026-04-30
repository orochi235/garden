import { useCallback, useMemo, useState } from 'react';
import type { Collection } from '../model/collection';
import { addToCollection, removeFromCollection, snapshotCultivar } from '../model/collection';
import type { Cultivar, CultivarCategory } from '../model/cultivars';
import { getSpecies } from '../model/species';

export type Side = 'left' | 'right';

export interface CollectionEditorState {
  pending: Collection;
  dirty: boolean;
  leftChecked: Set<string>;
  rightChecked: Set<string>;
  toggleSelection: (side: Side, cultivarId: string) => void;
  transferRight: () => void;
  transferLeft: () => void;
  dragTransfer: (from: Side, draggedId: string) => void;
  setSearch: (side: Side, value: string) => void;
  setCategories: (side: Side, value: Set<CultivarCategory>) => void;
  toggleSpeciesExpand: (side: Side, speciesId: string) => void;
  expandedSpecies: (side: Side) => Set<string>;
  searchOf: (side: Side) => string;
  categoriesOf: (side: Side) => Set<CultivarCategory>;
  visibleCultivars: (side: Side, source: Cultivar[]) => Cultivar[];
}

export function useCollectionEditorState(committed: Collection, database: Cultivar[]): CollectionEditorState {
  const [pending, setPending] = useState<Collection>(committed);
  const [leftChecked, setLeftChecked] = useState<Set<string>>(() => new Set());
  const [rightChecked, setRightChecked] = useState<Set<string>>(() => new Set());

  const [searchLeft, setSearchLeftState] = useState('');
  const [searchRight, setSearchRightState] = useState('');
  const [catsLeft, setCatsLeftState] = useState<Set<CultivarCategory>>(() => new Set());
  const [catsRight, setCatsRightState] = useState<Set<CultivarCategory>>(() => new Set());
  const [expandedLeft, setExpandedLeft] = useState<Set<string>>(() => new Set());
  const [expandedRight, setExpandedRight] = useState<Set<string>>(() => new Set());

  const toggleSelection = useCallback((side: Side, cultivarId: string) => {
    const setter = side === 'left' ? setLeftChecked : setRightChecked;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(cultivarId)) next.delete(cultivarId);
      else next.add(cultivarId);
      return next;
    });
  }, []);

  const transferRight = useCallback(() => {
    if (leftChecked.size === 0) return;
    const additions: Cultivar[] = [];
    for (const id of leftChecked) {
      const source = database.find((c) => c.id === id);
      if (source) additions.push(snapshotCultivar(source));
    }
    setPending((prev) => addToCollection(prev, additions));
    setLeftChecked(new Set());
  }, [leftChecked, database]);

  const transferLeft = useCallback(() => {
    if (rightChecked.size === 0) return;
    const ids = [...rightChecked];
    setPending((prev) => removeFromCollection(prev, ids));
    setRightChecked(new Set());
  }, [rightChecked]);

  const dragTransfer = useCallback((from: Side, draggedId: string) => {
    const checked = from === 'left' ? leftChecked : rightChecked;
    const setChecked = from === 'left' ? setLeftChecked : setRightChecked;
    const useGroup = checked.has(draggedId);
    const ids = useGroup ? [...checked] : [draggedId];

    if (from === 'left') {
      const additions: Cultivar[] = [];
      for (const id of ids) {
        const source = database.find((c) => c.id === id);
        if (source) additions.push(snapshotCultivar(source));
      }
      setPending((prev) => addToCollection(prev, additions));
    } else {
      setPending((prev) => removeFromCollection(prev, ids));
    }

    if (useGroup) setChecked(new Set());
  }, [leftChecked, rightChecked, database]);

  const setSearch = useCallback((side: Side, value: string) => {
    (side === 'left' ? setSearchLeftState : setSearchRightState)(value);
  }, []);

  const setCategories = useCallback((side: Side, value: Set<CultivarCategory>) => {
    (side === 'left' ? setCatsLeftState : setCatsRightState)(value);
  }, []);

  const toggleSpeciesExpand = useCallback((side: Side, speciesId: string) => {
    const setter = side === 'left' ? setExpandedLeft : setExpandedRight;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(speciesId)) next.delete(speciesId);
      else next.add(speciesId);
      return next;
    });
  }, []);

  const expandedSpecies = useCallback(
    (side: Side) => (side === 'left' ? expandedLeft : expandedRight),
    [expandedLeft, expandedRight],
  );

  const searchOf = useCallback(
    (side: Side) => (side === 'left' ? searchLeft : searchRight),
    [searchLeft, searchRight],
  );

  const categoriesOf = useCallback(
    (side: Side) => (side === 'left' ? catsLeft : catsRight),
    [catsLeft, catsRight],
  );

  const visibleCultivars = useCallback(
    (side: Side, source: Cultivar[]): Cultivar[] => {
      const search = (side === 'left' ? searchLeft : searchRight).trim().toLowerCase();
      const cats = side === 'left' ? catsLeft : catsRight;
      let filtered = cats.size > 0 ? source.filter((c) => cats.has(c.category)) : source;
      if (search) {
        // Prefer exact species-name match: if the search term exactly matches a species
        // name in the source, restrict to that species to avoid cross-species noise from
        // cultivar names that happen to contain the species name as a substring.
        const exactSpeciesMatch = filtered.some(
          (c) => (getSpecies(c.speciesId)?.name ?? '').toLowerCase() === search,
        );
        if (exactSpeciesMatch) {
          filtered = filtered.filter(
            (c) => (getSpecies(c.speciesId)?.name ?? '').toLowerCase() === search,
          );
        } else {
          filtered = filtered.filter((c) => {
            const species = getSpecies(c.speciesId);
            const haystack = [
              c.name,
              species?.name ?? '',
              species?.taxonomicName ?? '',
            ].join(' ').toLowerCase();
            return haystack.includes(search);
          });
        }
      }
      return filtered;
    },
    [searchLeft, searchRight, catsLeft, catsRight],
  );

  const dirty = useMemo(() => !sameIds(committed, pending), [committed, pending]);

  return {
    pending,
    dirty,
    leftChecked,
    rightChecked,
    toggleSelection,
    transferRight,
    transferLeft,
    dragTransfer,
    setSearch,
    setCategories,
    toggleSpeciesExpand,
    expandedSpecies,
    searchOf,
    categoriesOf,
    visibleCultivars,
  };
}

function sameIds(a: Collection, b: Collection): boolean {
  if (a.length !== b.length) return false;
  const aIds = new Set(a.map((c) => c.id));
  for (const c of b) if (!aIds.has(c.id)) return false;
  return true;
}
