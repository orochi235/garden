import { useCallback, useEffect, useRef } from 'react';
import {
  createBringForwardOp,
  createSendBackwardOp,
  createBringToFrontOp,
  createSendToBackOp,
} from '../../ops/reorder';
import type { Op } from '../../ops/types';

export interface ReorderAdapter {
  getSelection(): string[];
  getParent(id: string): string | null;
  /** Optional — when absent, every reorder method is a silent no-op. */
  getChildren?(parentId: string | null): string[];
  /** Optional — when absent, every reorder method is a silent no-op. */
  setChildOrder?(parentId: string | null, ids: string[]): void;
  applyBatch(ops: Op[], label: string): void;
}

export interface UseReorderActionOptions {
  /** Auto-bind ], [, Shift+], Shift+[ on document. Default true. */
  enableKeyboard?: boolean;
  /** Optional filter — given selected ids, return the subset to reorder. */
  filter?: (ids: string[]) => string[];
}

export interface UseReorderActionReturn {
  bringForward(): void;
  sendBackward(): void;
  bringToFront(): void;
  sendToBack(): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((target as HTMLElement).isContentEditable) return true;
  if (target.getAttribute('contenteditable') === 'true' || target.getAttribute('contenteditable') === '') return true;
  return false;
}

export function useReorderAction(
  adapter: ReorderAdapter,
  options: UseReorderActionOptions = {},
): UseReorderActionReturn {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const optsRef = useRef(options);
  optsRef.current = options;

  const dispatch = useCallback(
    (factory: (args: { ids: string[] }) => Op, label: string) => {
      const a = adapterRef.current;
      if (!a.getChildren || !a.setChildOrder) return;
      const sel = a.getSelection();
      const ids = optsRef.current.filter ? optsRef.current.filter(sel) : sel;
      if (ids.length === 0) return;
      const op = factory({ ids });
      a.applyBatch([op], label);
    },
    [],
  );

  const bringForward = useCallback(() => dispatch(createBringForwardOp, 'Bring forward'), [dispatch]);
  const sendBackward = useCallback(() => dispatch(createSendBackwardOp, 'Send backward'), [dispatch]);
  const bringToFront = useCallback(() => dispatch(createBringToFrontOp, 'Bring to front'), [dispatch]);
  const sendToBack = useCallback(() => dispatch(createSendToBackOp, 'Send to back'), [dispatch]);

  useEffect(() => {
    const enable = options.enableKeyboard ?? true;
    if (!enable) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === ']' && !e.shiftKey) { e.preventDefault(); bringForward(); return; }
      if (e.key === '[' && !e.shiftKey) { e.preventDefault(); sendBackward(); return; }
      // Shift+] is '}' on US keyboards but e.key === ']' with shiftKey true on most
      // browsers; check both representations to be safe.
      if ((e.key === ']' || e.key === '}') && e.shiftKey) { e.preventDefault(); bringToFront(); return; }
      if ((e.key === '[' || e.key === '{') && e.shiftKey) { e.preventDefault(); sendToBack(); return; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [options.enableKeyboard, bringForward, sendBackward, bringToFront, sendToBack]);

  return { bringForward, sendBackward, bringToFront, sendToBack };
}
