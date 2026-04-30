import { useCallback, useMemo, useState } from 'react';
import type { Collection } from '../model/collection';

export type Side = 'left' | 'right';

export interface CollectionEditorState {
  pending: Collection;
  dirty: boolean;
  leftChecked: Set<string>;
  rightChecked: Set<string>;
  toggleSelection: (side: Side, cultivarId: string) => void;
}

export function useCollectionEditorState(committed: Collection): CollectionEditorState {
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

  const dirty = useMemo(() => !sameIds(committed, pending), [committed, pending]);

  return { pending, dirty, leftChecked, rightChecked, toggleSelection };
}

function sameIds(a: Collection, b: Collection): boolean {
  if (a.length !== b.length) return false;
  const aIds = new Set(a.map((c) => c.id));
  for (const c of b) if (!aIds.has(c.id)) return false;
  return true;
}
