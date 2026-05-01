import { useCallback, useRef, useState } from 'react';
import type { AreaSelectAdapter } from '../../adapters/types';
import type {
  AreaSelectBehavior,
  AreaSelectOverlay,
  AreaSelectPose,
  GestureContext,
  ModifierState,
} from '../types';

const GID = 'gesture';

export interface UseAreaSelectInteractionOptions {
  behaviors?: AreaSelectBehavior[];
  /** When set, overrides any behavior's `defaultTransient`. Default: behaviors decide. */
  transient?: boolean;
  /** Label used when transient is false and the hook falls back to applyBatch. Default 'Area select'. */
  label?: string;
  onGestureStart?: () => void;
  onGestureEnd?: (committed: boolean) => void;
}

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

  const move = useCallback((_wx: number, _wy: number, _mods: ModifierState): boolean => {
    return stateRef.current.active;
  }, []);

  const end = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  const cancel = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  void transientOpt; void label;

  return { start, move, end, cancel, isAreaSelecting: overlay !== null, overlay };
}
