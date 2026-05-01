import { useCallback, useEffect, useRef } from 'react';
import { createSetSelectionOp } from '../../ops/selection';
import type { Op } from '../../ops/types';

/** Adapter for `useSelectAllAction`. */
export interface SelectAllAdapter {
  /** Read current selection (used as `from` for the setSelection op). */
  getSelection(): string[];
  /** Return all selectable ids. */
  listAll(): string[];
  /** Required: standard op-batch entry point. */
  applyBatch(ops: Op[], label?: string): void;
}

/** Options for `useSelectAllAction`. */
export interface UseSelectAllActionOptions {
  /** Auto-bind Ctrl/Cmd+A on document. Default true. */
  enableKeyboard?: boolean;
  /** Label passed to applyBatch. Default 'Select all'. */
  label?: string;
}

/** Return shape of `useSelectAllAction`. */
export interface UseSelectAllActionReturn {
  /** Imperative trigger — selects every id from the adapter. */
  selectAll(): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((target as HTMLElement).isContentEditable) return true;
  if (target.getAttribute('contenteditable') === 'true' || target.getAttribute('contenteditable') === '') return true;
  return false;
}

/** Select-all action; binds Ctrl/Cmd+A on document by default. */
export function useSelectAllAction(
  adapter: SelectAllAdapter,
  options: UseSelectAllActionOptions = {},
): UseSelectAllActionReturn {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const optsRef = useRef(options);
  optsRef.current = options;

  const selectAll = useCallback((): void => {
    const a = adapterRef.current;
    const o = optsRef.current;
    const all = a.listAll();
    if (all.length === 0) return;
    const from = a.getSelection();
    a.applyBatch(
      [createSetSelectionOp({ from, to: all })],
      o.label ?? 'Select all',
    );
  }, []);

  const enableKeyboard = options.enableKeyboard ?? true;
  useEffect(() => {
    if (!enableKeyboard) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'a' && e.key !== 'A') return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      selectAll();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enableKeyboard, selectAll]);

  return { selectAll };
}
