/**
 * Vendored shared drag-gesture primitive (pin copy).
 *
 * Threshold-aware pointer drag state machine that `useMove` and `useDragRect`
 * (and through it `useAreaSelect`) build on. Pure React + local state — no kit
 * dependency beyond the vendored `ModifierState` type.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ModifierState } from './types';

/** Pointer position in both world (gesture-coord) and client (CSS-px) space. */
export interface DragGesturePoint {
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
}

/** Phase exposed on the public controller and inside ctx for callbacks. */
export type DragGesturePhase = 'idle' | 'pending' | 'active';

/** Live gesture context handed to lifecycle callbacks. */
export interface DragGestureCtx<TScratch = unknown> {
  start: DragGesturePoint;
  current: DragGesturePoint;
  modifiers: ModifierState;
  scratch: TScratch;
  /** 'pending' or 'active'. Never 'idle' inside a callback. */
  phase: 'pending' | 'active';
}

export interface DragGestureEndCtx<TScratch = unknown> extends DragGestureCtx<TScratch> {
  /** True if phase never reached 'active'. */
  wasSubThreshold: boolean;
}

export interface UseDragGestureOptions<TScratch = unknown> {
  initScratch?: () => TScratch;
  /** Predicate consulted on each move while phase === 'pending'. */
  thresholdReached?: (ctx: DragGestureCtx<TScratch>) => boolean;
  onStart?: (ctx: DragGestureCtx<TScratch>) => void;
  onActivate?: (ctx: DragGestureCtx<TScratch>) => void;
  onMove?: (ctx: DragGestureCtx<TScratch>) => void;
  onEnd?: (ctx: DragGestureEndCtx<TScratch>) => boolean | undefined;
  onCancel?: (ctx: DragGestureCtx<TScratch>) => void;
  onGestureStart?: () => void;
  onGestureEnd?: (committed: boolean) => void;
}

export interface DragGestureController {
  start(point: DragGesturePoint, modifiers: ModifierState): void;
  move(point: DragGesturePoint, modifiers: ModifierState): boolean;
  end(): void;
  cancel(): void;
  readonly phase: DragGesturePhase;
  readonly isActive: boolean;
}

interface InternalState<TScratch> {
  phase: 'pending' | 'active';
  start: DragGesturePoint;
  current: DragGesturePoint;
  modifiers: ModifierState;
  scratch: TScratch;
}

export function useDragGesture<TScratch = unknown>(
  options: UseDragGestureOptions<TScratch> = {},
): DragGestureController {
  const optsRef = useRef(options);
  optsRef.current = options;
  const stateRef = useRef<InternalState<TScratch> | null>(null);
  const [, setPhaseTick] = useState(0);
  const phaseRef = useRef<DragGesturePhase>('idle');
  const bumpPhase = useCallback((next: DragGesturePhase) => {
    phaseRef.current = next;
    setPhaseTick((n) => n + 1);
  }, []);

  const buildCtx = useCallback((): DragGestureCtx<TScratch> => {
    const s = stateRef.current!;
    return {
      get start() {
        return s.start;
      },
      get current() {
        return s.current;
      },
      get modifiers() {
        return s.modifiers;
      },
      get scratch() {
        return s.scratch;
      },
      get phase() {
        return s.phase;
      },
    };
  }, []);

  const start = useCallback(
    (point: DragGesturePoint, modifiers: ModifierState) => {
      const opts = optsRef.current;
      const scratch = opts.initScratch ? opts.initScratch() : ({} as TScratch);
      const initialPhase: 'pending' | 'active' = opts.thresholdReached ? 'pending' : 'active';
      stateRef.current = {
        phase: initialPhase,
        start: point,
        current: point,
        modifiers,
        scratch,
      };
      bumpPhase(initialPhase);
      opts.onGestureStart?.();
      opts.onStart?.(buildCtx());
    },
    [buildCtx, bumpPhase],
  );

  const move = useCallback(
    (point: DragGesturePoint, modifiers: ModifierState): boolean => {
      const s = stateRef.current;
      if (!s) return false;
      s.current = point;
      s.modifiers = modifiers;
      const opts = optsRef.current;
      if (s.phase === 'pending' && opts.thresholdReached) {
        const ctx = buildCtx();
        if (opts.thresholdReached(ctx)) {
          s.phase = 'active';
          bumpPhase('active');
          opts.onActivate?.(buildCtx());
        }
      }
      opts.onMove?.(buildCtx());
      return true;
    },
    [buildCtx, bumpPhase],
  );

  const end = useCallback(() => {
    const s = stateRef.current;
    const opts = optsRef.current;
    if (!s) {
      opts.onGestureEnd?.(false);
      return;
    }
    const wasSubThreshold = s.phase === 'pending';
    const endCtx: DragGestureEndCtx<TScratch> = {
      get start() {
        return s.start;
      },
      get current() {
        return s.current;
      },
      get modifiers() {
        return s.modifiers;
      },
      get scratch() {
        return s.scratch;
      },
      get phase() {
        return s.phase;
      },
      wasSubThreshold,
    };
    let committed = false;
    try {
      const r = opts.onEnd?.(endCtx);
      committed = r !== false;
    } finally {
      stateRef.current = null;
      bumpPhase('idle');
      opts.onGestureEnd?.(committed);
    }
  }, [bumpPhase]);

  const cancel = useCallback(() => {
    const s = stateRef.current;
    const opts = optsRef.current;
    if (s) opts.onCancel?.(buildCtx());
    stateRef.current = null;
    bumpPhase('idle');
    opts.onGestureEnd?.(false);
  }, [buildCtx, bumpPhase]);

  return useMemo<DragGestureController>(
    () => ({
      start,
      move,
      end,
      cancel,
      get phase() {
        return phaseRef.current;
      },
      get isActive() {
        return phaseRef.current !== 'idle';
      },
    }),
    [start, move, end, cancel],
  );
}
