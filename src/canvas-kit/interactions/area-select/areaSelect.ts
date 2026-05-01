import { useCallback, useRef, useState } from 'react';
import type { Op } from '../../ops/types';
import type { AreaSelectAdapter } from '../../adapters/types';
import type {
  AreaSelectBehavior,
  AreaSelectOverlay,
  AreaSelectPose,
  GestureContext,
  ModifierState,
} from '../types';

const GID = 'gesture';

/** Options for `useAreaSelectInteraction`. */
export interface UseAreaSelectInteractionOptions {
  behaviors?: AreaSelectBehavior[];
  /** When set, overrides any behavior's `defaultTransient`. Default: behaviors decide. */
  transient?: boolean;
  /** Label used when transient is false and the hook falls back to applyBatch. Default 'Area select'. */
  label?: string;
  onGestureStart?: () => void;
  onGestureEnd?: (committed: boolean) => void;
}

/** Return shape of `useAreaSelectInteraction`: lifecycle methods and live marquee overlay. */
export interface UseAreaSelectInteractionReturn {
  start(worldX: number, worldY: number, modifiers: ModifierState): void;
  move(worldX: number, worldY: number, modifiers: ModifierState): boolean;
  end(): void;
  cancel(): void;
  isAreaSelecting: boolean;
  overlay: AreaSelectOverlay | null;
}

interface State {
  active: boolean;
  ctx: GestureContext<AreaSelectPose> | null;
}

/** Drag-rectangle area-select interaction; behaviors decide replace-vs-add semantics from modifiers. */
export function useAreaSelectInteraction(
  adapter: AreaSelectAdapter,
  options: UseAreaSelectInteractionOptions,
): UseAreaSelectInteractionReturn {
  const { behaviors = [], transient: transientOpt, label = 'Area select', onGestureStart, onGestureEnd } = options;
  const behaviorsRef = useRef(behaviors);
  behaviorsRef.current = behaviors;

  const stateRef = useRef<State>({ active: false, ctx: null });
  const [overlay, setOverlay] = useState<AreaSelectOverlay | null>(null);

  const cleanup = useCallback(() => {
    stateRef.current.active = false;
    stateRef.current.ctx = null;
    setOverlay(null);
  }, []);

  const start = useCallback((worldX: number, worldY: number, modifiers: ModifierState) => {
    const startPose: AreaSelectPose = { worldX, worldY, shiftHeld: modifiers.shift };
    const ctx: GestureContext<AreaSelectPose> = {
      draggedIds: [GID],
      origin: new Map([[GID, startPose]]),
      current: new Map([[GID, startPose]]),
      snap: null,
      modifiers,
      pointer: { worldX, worldY, clientX: 0, clientY: 0 },
      adapter: adapter as unknown as GestureContext<AreaSelectPose>['adapter'],
      scratch: {},
    };
    for (const b of behaviorsRef.current) b.onStart?.(ctx);
    stateRef.current = { active: true, ctx };
    onGestureStart?.();
    setOverlay({
      start: { worldX, worldY },
      current: { worldX, worldY },
      shiftHeld: modifiers.shift,
    });
  }, [adapter, onGestureStart]);

  const move = useCallback((worldX: number, worldY: number, modifiers: ModifierState): boolean => {
    const s = stateRef.current;
    if (!s.active || !s.ctx) return false;
    const ctx = s.ctx;
    ctx.modifiers = modifiers;
    ctx.pointer = { worldX, worldY, clientX: 0, clientY: 0 };
    const start = ctx.origin.get(GID)!;
    const current: AreaSelectPose = { worldX, worldY, shiftHeld: start.shiftHeld };
    ctx.current.set(GID, current);
    for (const b of behaviorsRef.current) {
      b.onMove?.(ctx, {
        start: { worldX: start.worldX, worldY: start.worldY },
        current: { worldX, worldY },
        shiftHeld: start.shiftHeld,
      });
    }
    setOverlay({
      start: { worldX: start.worldX, worldY: start.worldY },
      current: { worldX, worldY },
      shiftHeld: start.shiftHeld,
    });
    return true;
  }, []);

  const end = useCallback(() => {
    const s = stateRef.current;
    if (!s.active || !s.ctx) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }
    const ctx = s.ctx;
    let collected: Op[] | null | undefined;
    for (const b of behaviorsRef.current) {
      const r = b.onEnd?.(ctx);
      if (r === undefined) continue;
      collected = r;
      break;
    }
    if (collected === null) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }
    if (collected === undefined || collected.length === 0) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }

    const transient = transientOpt ?? behaviorsRef.current.some((b) => b.defaultTransient === true);

    if (transient) {
      (adapter as AreaSelectAdapter).applyOps(collected);
    } else {
      const adapterWithBatch = adapter as AreaSelectAdapter & {
        applyBatch?: (ops: Op[], label: string) => void;
      };
      adapterWithBatch.applyBatch?.(collected, label);
    }
    cleanup();
    onGestureEnd?.(true);
  }, [adapter, cleanup, label, onGestureEnd, transientOpt]);

  const cancel = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  return { start, move, end, cancel, isAreaSelecting: overlay !== null, overlay };
}
