import { useCallback, useMemo, useState } from 'react';
import type { Collection } from '../model/collection';
import { addToCollection, removeFromCollection, snapshotCultivar } from '../model/collection';
import type { Cultivar } from '../model/cultivars';

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
}

export function useCollectionEditorState(committed: Collection, database: Cultivar[]): CollectionEditorState {
  const [pending, setPending] = useState<Collection>(committed);
  const [leftChecked, setLeftChecked] = useState<Set<string>>(() => new Set());
  const [rightChecked, setRightChecked] = useState<Set<string>>(() => new Set());

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

  const dirty = useMemo(() => !sameIds(committed, pending), [committed, pending]);

  return { pending, dirty, leftChecked, rightChecked, toggleSelection, transferRight, transferLeft, dragTransfer };
}

function sameIds(a: Collection, b: Collection): boolean {
  if (a.length !== b.length) return false;
  const aIds = new Set(a.map((c) => c.id));
  for (const c of b) if (!aIds.has(c.id)) return false;
  return true;
}
