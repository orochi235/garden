import { useCallback, useEffect, useRef } from 'react';
import { createSetSelectionOp } from '../../ops/selection';
import type { Op } from '../../ops/types';

export interface EscapeAdapter {
  /** Read current selection. */
  getSelection(): string[];
  /** Required: standard op-batch entry point. */
  applyBatch(ops: Op[], label?: string): void;
}

export interface UseEscapeActionOptions {
  /** Auto-bind Escape on document. Default true. */
  enableKeyboard?: boolean;
  /** Label passed to applyBatch. Default 'Clear selection'. */
  label?: string;
}

export interface UseEscapeActionReturn {
  /** Imperative trigger — clears the current selection. */
  clearSelection(): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((target as HTMLElement).isContentEditable) return true;
  if (target.getAttribute('contenteditable') === 'true' || target.getAttribute('contenteditable') === '') return true;
  return false;
}

export function useEscapeAction(
  adapter: EscapeAdapter,
  options: UseEscapeActionOptions = {},
): UseEscapeActionReturn {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const optsRef = useRef(options);
  optsRef.current = options;

  const clearSelection = useCallback((): void => {
    const a = adapterRef.current;
    const o = optsRef.current;
    const sel = a.getSelection();
    if (sel.length === 0) return;
    const op = createSetSelectionOp({ from: sel, to: [] });
    a.applyBatch([op], o.label ?? 'Clear selection');
  }, []);

  const enableKeyboard = options.enableKeyboard ?? true;
  useEffect(() => {
    if (!enableKeyboard) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      clearSelection();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enableKeyboard, clearSelection]);

  return { clearSelection };
}
