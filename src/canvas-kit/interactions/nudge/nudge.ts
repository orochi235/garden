import { useCallback, useEffect, useRef } from 'react';
import { createTransformOp } from '../../ops/transform';
import type { Op } from '../../ops/types';

export type NudgeDirection = 'up' | 'down' | 'left' | 'right';

export interface NudgeAdapter<TPose> {
  /** Read current selection. */
  getSelection(): string[];
  /** Read pose for an id; used as `from` for the transform op. */
  getPose(id: string): TPose;
  /** Required: standard op-batch entry point. */
  applyBatch(ops: Op[], label?: string): void;
}

export interface UseNudgeActionOptions<TPose> {
  /** Required: pure pose translator — same shape as in move. */
  translatePose: (pose: TPose, dx: number, dy: number) => TPose;
  /** Auto-bind arrow keys on document. Default true. */
  enableKeyboard?: boolean;
  /** Label passed to applyBatch. Default 'Nudge'. */
  label?: string;
  /** Base step in world units. Default 1. */
  step?: number;
  /** Step used when shift held. Default 10. */
  shiftStep?: number;
}

export interface UseNudgeActionReturn {
  /** Imperative trigger. `large=true` uses `shiftStep`. */
  nudge(direction: NudgeDirection, large?: boolean): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((target as HTMLElement).isContentEditable) return true;
  if (target.getAttribute('contenteditable') === 'true' || target.getAttribute('contenteditable') === '') return true;
  return false;
}

function deltaFor(direction: NudgeDirection, step: number): { dx: number; dy: number } {
  switch (direction) {
    case 'left':  return { dx: -step, dy: 0 };
    case 'right': return { dx:  step, dy: 0 };
    case 'up':    return { dx: 0, dy: -step };
    case 'down':  return { dx: 0, dy:  step };
  }
}

export function useNudgeAction<TPose>(
  adapter: NudgeAdapter<TPose>,
  options: UseNudgeActionOptions<TPose>,
): UseNudgeActionReturn {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const optsRef = useRef(options);
  optsRef.current = options;

  const nudge = useCallback((direction: NudgeDirection, large = false): void => {
    const a = adapterRef.current;
    const o = optsRef.current;
    const sel = a.getSelection();
    if (sel.length === 0) return;
    const step = large ? (o.shiftStep ?? 10) : (o.step ?? 1);
    const { dx, dy } = deltaFor(direction, step);
    const ops: Op[] = sel.map((id) => {
      const from = a.getPose(id);
      const to = o.translatePose(from, dx, dy);
      return createTransformOp<TPose>({ id, from, to });
    });
    a.applyBatch(ops, o.label ?? 'Nudge');
  }, []);

  const enableKeyboard = options.enableKeyboard ?? true;
  useEffect(() => {
    if (!enableKeyboard) return;
    const handler = (e: KeyboardEvent) => {
      let direction: NudgeDirection | null = null;
      if (e.key === 'ArrowLeft')  direction = 'left';
      else if (e.key === 'ArrowRight') direction = 'right';
      else if (e.key === 'ArrowUp')    direction = 'up';
      else if (e.key === 'ArrowDown')  direction = 'down';
      if (!direction) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      nudge(direction, e.shiftKey);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enableKeyboard, nudge]);

  return { nudge };
}
