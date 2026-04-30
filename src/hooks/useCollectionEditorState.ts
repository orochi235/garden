import { useCallback, useMemo, useState } from 'react';
import type { Collection } from '../model/collection';
import { addToCollection, removeFromCollection, snapshotCultivar } from '../model/collection';
import type { Cultivar, CultivarCategory } from '../model/cultivars';
import { getSpecies } from '../model/species';

export type Side = 'left' | 'right';
export type TriState = 'none' | 'some' | 'all';

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
  speciesSelectionState: (side: Side, speciesId: string, visibleChildren: Cultivar[]) => TriState;
  toggleSpeciesSelection: (side: Side, speciesId: string, visibleChildren: Cultivar[]) => void;
  cancel: () => void;
  computeRemovedIds: () => string[];
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
      return source.filter((c) => {
        if (cats.size > 0 && !cats.has(c.category)) return false;
        if (search) {
          const species = getSpecies(c.speciesId);
          const haystack = [
            c.name,
            species?.name ?? '',
            species?.taxonomicName ?? '',
          ].join(' ').toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      });
    },
    [searchLeft, searchRight, catsLeft, catsRight],
  );

  const speciesSelectionState = useCallback(
    (side: Side, _speciesId: string, visibleChildren: Cultivar[]): TriState => {
      if (visibleChildren.length === 0) return 'none';
      const checked = side === 'left' ? leftChecked : rightChecked;
      const checkedCount = visibleChildren.filter((c) => checked.has(c.id)).length;
      if (checkedCount === 0) return 'none';
      if (checkedCount === visibleChildren.length) return 'all';
      return 'some';
    },
    [leftChecked, rightChecked],
  );

  const toggleSpeciesSelection = useCallback(
    (side: Side, _speciesId: string, visibleChildren: Cultivar[]) => {
      const setter = side === 'left' ? setLeftChecked : setRightChecked;
      setter((prev) => {
        const allChecked = visibleChildren.every((c) => prev.has(c.id));
        const next = new Set(prev);
        if (allChecked) {
          for (const c of visibleChildren) next.delete(c.id);
        } else {
          for (const c of visibleChildren) next.add(c.id);
        }
        return next;
      });
    },
    [],
  );

  const cancel = useCallback(() => {
    setPending(committed);
    setLeftChecked(new Set());
    setRightChecked(new Set());
    setSearchLeftState('');
    setSearchRightState('');
    setCatsLeftState(new Set());
    setCatsRightState(new Set());
    setExpandedLeft(new Set());
    setExpandedRight(new Set());
  }, [committed]);

  const computeRemovedIds = useCallback((): string[] => {
    const pendingIds = new Set(pending.map((c) => c.id));
    return committed.filter((c) => !pendingIds.has(c.id)).map((c) => c.id);
  }, [committed, pending]);

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
    speciesSelectionState,
    toggleSpeciesSelection,
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
