import { useCallback, useMemo, useState } from 'react';
import type { Collection } from '../model/collection';
import { addToCollection, removeFromCollection, snapshotCultivar } from '../model/collection';
import type { Cultivar, CultivarCategory } from '../model/cultivars';
import { getSpecies } from '../model/species';

export type TriState = 'none' | 'some' | 'all';

export type SortColumn = 'name' | 'variety' | 'species' | 'category' | 'taxonomic';
export type SortDir = 'asc' | 'desc';

export interface CollectionEditorState {
  pending: Collection;
  dirty: boolean;
  checked: Set<string>;
  search: string;
  categories: Set<CultivarCategory>;
  expandedSpecies: Set<string>;
  sortColumn: SortColumn;
  sortDir: SortDir;
  toggleChecked: (cultivarId: string) => void;
  toggleSpeciesExpand: (speciesId: string) => void;
  setSearch: (value: string) => void;
  setCategories: (value: Set<CultivarCategory>) => void;
  setSort: (column: SortColumn) => void;
  visibleCultivars: (source: Cultivar[]) => Cultivar[];
  speciesSelectionState: (visibleChildren: Cultivar[]) => TriState;
  toggleSpeciesSelection: (visibleChildren: Cultivar[]) => void;
  transferRight: () => void;
  addOne: (id: string) => void;
  addMany: (ids: string[]) => void;
  removeOne: (id: string) => void;
  cancel: () => void;
  computeRemovedIds: () => string[];
}

export function useCollectionEditorState(committed: Collection, database: Cultivar[]): CollectionEditorState {
  const [pending, setPending] = useState<Collection>(committed);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [search, setSearchState] = useState('');
  const [categories, setCategoriesState] = useState<Set<CultivarCategory>>(
    () => new Set(database.map((c) => c.category)),
  );
  const [expandedSpecies, setExpandedSpecies] = useState<Set<string>>(
    () => new Set(database.map((c) => c.speciesId)),
  );
  const [sortColumn, setSortColumn] = useState<SortColumn>('species');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleChecked = useCallback((cultivarId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(cultivarId)) next.delete(cultivarId);
      else next.add(cultivarId);
      return next;
    });
  }, []);

  const toggleSpeciesExpand = useCallback((speciesId: string) => {
    setExpandedSpecies((prev) => {
      const next = new Set(prev);
      if (next.has(speciesId)) next.delete(speciesId);
      else next.add(speciesId);
      return next;
    });
  }, []);

  const setSearch = useCallback((value: string) => setSearchState(value), []);
  const setCategories = useCallback(
    (value: Set<CultivarCategory>) => setCategoriesState(value),
    [],
  );

  const setSort = useCallback((column: SortColumn) => {
    setSortColumn((prevCol) => {
      setSortDir((prevDir) => (prevCol === column ? (prevDir === 'asc' ? 'desc' : 'asc') : 'asc'));
      return column;
    });
  }, []);

  const visibleCultivars = useCallback(
    (source: Cultivar[]): Cultivar[] => {
      const needle = search.trim().toLowerCase();
      return source.filter((c) => {
        if (!categories.has(c.category)) return false;
        if (needle) {
          const sp = getSpecies(c.speciesId);
          const haystack = [c.name, sp?.name ?? '', sp?.taxonomicName ?? '']
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      });
    },
    [search, categories],
  );

  const speciesSelectionState = useCallback(
    (visibleChildren: Cultivar[]): TriState => {
      if (visibleChildren.length === 0) return 'none';
      let count = 0;
      for (const c of visibleChildren) if (checked.has(c.id)) count++;
      if (count === 0) return 'none';
      if (count === visibleChildren.length) return 'all';
      return 'some';
    },
    [checked],
  );

  const toggleSpeciesSelection = useCallback((visibleChildren: Cultivar[]) => {
    setChecked((prev) => {
      const allChecked = visibleChildren.every((c) => prev.has(c.id));
      const next = new Set(prev);
      if (allChecked) {
        for (const c of visibleChildren) next.delete(c.id);
      } else {
        for (const c of visibleChildren) next.add(c.id);
      }
      return next;
    });
  }, []);

  const transferRight = useCallback(() => {
    if (checked.size === 0) return;
    const additions: Cultivar[] = [];
    for (const id of checked) {
      const source = database.find((c) => c.id === id);
      if (source) additions.push(snapshotCultivar(source));
    }
    setPending((prev) => addToCollection(prev, additions));
    setChecked(new Set());
  }, [checked, database]);

  const addOne = useCallback((id: string) => {
    const source = database.find((c) => c.id === id);
    if (!source) return;
    setPending((prev) => addToCollection(prev, [snapshotCultivar(source)]));
    setChecked((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [database]);

  const addMany = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const additions: Cultivar[] = [];
    for (const id of ids) {
      const source = database.find((c) => c.id === id);
      if (source) additions.push(snapshotCultivar(source));
    }
    if (additions.length === 0) return;
    setPending((prev) => addToCollection(prev, additions));
    setChecked((prev) => {
      let next: Set<string> | null = null;
      for (const id of ids) {
        if (prev.has(id)) {
          if (!next) next = new Set(prev);
          next.delete(id);
        }
      }
      return next ?? prev;
    });
  }, [database]);

  const removeOne = useCallback((id: string) => {
    setPending((prev) => removeFromCollection(prev, [id]));
  }, []);

  const cancel = useCallback(() => {
    setPending(committed);
    setChecked(new Set());
    setSearchState('');
    setCategoriesState(new Set(database.map((c) => c.category)));
    setExpandedSpecies(new Set(database.map((c) => c.speciesId)));
    setSortColumn('species');
    setSortDir('asc');
  }, [committed, database]);

  const computeRemovedIds = useCallback((): string[] => {
    const pendingIds = new Set(pending.map((c) => c.id));
    return committed.filter((c) => !pendingIds.has(c.id)).map((c) => c.id);
  }, [committed, pending]);

  const dirty = useMemo(() => !sameIds(committed, pending), [committed, pending]);

  return {
    pending,
    dirty,
    checked,
    search,
    categories,
    expandedSpecies,
    sortColumn,
    sortDir,
    toggleChecked,
    toggleSpeciesExpand,
    setSearch,
    setCategories,
    setSort,
    visibleCultivars,
    speciesSelectionState,
    toggleSpeciesSelection,
    transferRight,
    addOne,
    addMany,
    removeOne,
    cancel,
    computeRemovedIds,
  };
}

function sameIds(a: Collection, b: Collection): boolean {
  if (a.length !== b.length) return false;
  const aIds = new Set(a.map((c) => c.id));
  for (const c of b) if (!aIds.has(c.id)) return false;
  return true;
}
