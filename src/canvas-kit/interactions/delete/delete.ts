import { useCallback, useEffect, useRef } from 'react';
import { createDeleteOp } from '../../ops/delete';
import { createSetSelectionOp } from '../../ops/selection';
import type { Op } from '../../ops/types';

export interface DeleteAdapter {
  /** Read current selection. */
  getSelection(): string[];
  /** Optional: provide the object for a given id; required by `createDeleteOp`
   *  to capture the object for invert/insert. If omitted, a minimal stub
   *  `{ id }` is used — undo will only restore the id, not the full object. */
  getObject?(id: string): { id: string } | undefined | null;
  /** Required: standard op-batch entry point. */
  applyBatch(ops: Op[], label: string): void;
  /** Optional: clear selection after delete. If omitted, the hook still
   *  emits a SetSelectionOp([]) alongside DeleteOps. */
  setSelection?(ids: string[]): void;
}

export interface UseDeleteActionOptions {
  /** Auto-bind Delete and Backspace keys on document. Default false. */
  bindKeyboard?: boolean;
  /** Label passed to applyBatch. Default 'Delete'. */
  label?: string;
  /** Optional filter: given selected ids, return the subset to actually delete.
   *  Used by consumers to protect locked or undeletable objects. */
  filter?: (ids: string[]) => string[];
}

export interface UseDeleteActionReturn {
  /** Imperative trigger — deletes the current selection. Returns the ids
   *  that were deleted (after filter). Returns [] if nothing was deleted. */
  deleteSelection(): string[];
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((target as HTMLElement).isContentEditable) return true;
  if (target.getAttribute('contenteditable') === 'true' || target.getAttribute('contenteditable') === '') return true;
  return false;
}

export function useDeleteAction(
  adapter: DeleteAdapter,
  options: UseDeleteActionOptions = {},
): UseDeleteActionReturn {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const optsRef = useRef(options);
  optsRef.current = options;

  const deleteSelection = useCallback((): string[] => {
    const a = adapterRef.current;
    const o = optsRef.current;
    const sel = a.getSelection();
    const ids = o.filter ? o.filter(sel) : sel;
    if (ids.length === 0) return [];
    const ops: Op[] = ids.map((id) => {
      const obj = a.getObject?.(id) ?? { id };
      return createDeleteOp({ object: obj });
    });
    ops.push(createSetSelectionOp({ from: sel, to: [] }));
    a.applyBatch(ops, o.label ?? 'Delete');
    return ids;
  }, []);

  useEffect(() => {
    if (!options.bindKeyboard) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      deleteSelection();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [options.bindKeyboard, deleteSelection]);

  return { deleteSelection };
}
