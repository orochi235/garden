import { useCallback, useEffect, useRef } from 'react';
import { createInsertOp } from '../../ops/create';
import { createSetSelectionOp } from '../../ops/selection';
import type { Op } from '../../ops/types';

/** Adapter for `useDuplicateAction`. */
export interface DuplicateAdapter<TPose> {
  /** Read current selection. */
  getSelection(): string[];
  /** Read pose for an id (currently unused at op-emit time but exposed for
   *  symmetry with other selection-driven hooks; consumers commonly need it
   *  inside `cloneObject`). */
  getPose(id: string): TPose;
  /** Materialize a new object that is a copy of `id`, translated by `offset`.
   *  Implementations are responsible for assigning a fresh id and for any
   *  domain-specific cloning rules. The returned object is wrapped in an
   *  InsertOp by the hook. */
  cloneObject(id: string, offset: { dx: number; dy: number }): { id: string };
  /** Required: standard op-batch entry point. */
  applyBatch(ops: Op[], label?: string): void;
}

/** Options for `useDuplicateAction`. */
export interface UseDuplicateActionOptions {
  /** Auto-bind Ctrl/Cmd+D on document. Default true. */
  enableKeyboard?: boolean;
  /** Label passed to applyBatch. Default 'Duplicate'. */
  label?: string;
  /** Translation applied to each clone. Default `{ dx: 8, dy: 8 }`. */
  offset?: { dx: number; dy: number };
}

/** Return shape of `useDuplicateAction`. */
export interface UseDuplicateActionReturn {
  /** Imperative trigger — duplicates the current selection. */
  duplicate(): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((target as HTMLElement).isContentEditable) return true;
  if (target.getAttribute('contenteditable') === 'true' || target.getAttribute('contenteditable') === '') return true;
  return false;
}

const DEFAULT_OFFSET = { dx: 8, dy: 8 };

/** Selection-duplication action with offset; binds Ctrl/Cmd+D by default. */
export function useDuplicateAction<TPose>(
  adapter: DuplicateAdapter<TPose>,
  options: UseDuplicateActionOptions = {},
): UseDuplicateActionReturn {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const optsRef = useRef(options);
  optsRef.current = options;

  const duplicate = useCallback((): void => {
    const a = adapterRef.current;
    const o = optsRef.current;
    const sel = a.getSelection();
    if (sel.length === 0) return;
    const offset = o.offset ?? DEFAULT_OFFSET;
    const created = sel.map((id) => a.cloneObject(id, offset));
    if (created.length === 0) return;
    const newIds = created.map((c) => c.id);
    const ops: Op[] = [
      ...created.map((obj) => createInsertOp({ object: obj })),
      createSetSelectionOp({ from: sel, to: newIds }),
    ];
    a.applyBatch(ops, o.label ?? 'Duplicate');
  }, []);

  const enableKeyboard = options.enableKeyboard ?? true;
  useEffect(() => {
    if (!enableKeyboard) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'd' && e.key !== 'D') return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      duplicate();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enableKeyboard, duplicate]);

  return { duplicate };
}
