import { useCallback, useRef, useState } from 'react';
import { createInsertOp } from '../../ops/create';
import type { Op } from '../../ops/types';
import type { InsertAdapter } from '../../adapters/types';
import type {
  GestureContext,
  InsertBehavior,
  InsertOverlay,
  ModifierState,
} from '../types';

export interface UseInsertInteractionOptions<TPose extends { x: number; y: number }> {
  behaviors?: InsertBehavior<TPose>[];
  insertLabel?: string;
  /** Reserved; insert is never transient in practice. Ignored. */
  transient?: boolean;
  /** Strictly-greater-than thresholds; bounds with width <= or height <= abort. Default { width: 0, height: 0 }. */
  minBounds?: { width: number; height: number };
  onGestureStart?: () => void;
  onGestureEnd?: (committed: boolean) => void;
}

export interface UseInsertInteractionReturn<TPose extends { x: number; y: number }> {
  start(worldX: number, worldY: number, modifiers: ModifierState): void;
  move(worldX: number, worldY: number, modifiers: ModifierState): boolean;
  end(): void;
  cancel(): void;
  isInserting: boolean;
  overlay: InsertOverlay<TPose> | null;
}

const GID = 'gesture';

export function useInsertInteraction<TObject extends { id: string }, TPose extends { x: number; y: number }>(
  adapter: InsertAdapter<TObject>,
  options: UseInsertInteractionOptions<TPose>,
): UseInsertInteractionReturn<TPose> {
  const {
    behaviors = [],
    insertLabel = 'Insert',
    minBounds = { width: 0, height: 0 },
    onGestureStart,
    onGestureEnd,
  } = options;

  const behaviorsRef = useRef(behaviors);
  behaviorsRef.current = behaviors;

  const stateRef = useRef<{ active: boolean; ctx: GestureContext<TPose> | null }>({
    active: false,
    ctx: null,
  });
  const [overlay, setOverlay] = useState<InsertOverlay<TPose> | null>(null);

  const cleanup = useCallback(() => {
    stateRef.current.active = false;
    stateRef.current.ctx = null;
    setOverlay(null);
  }, []);

  const start = useCallback((worldX: number, worldY: number, modifiers: ModifierState) => {
    const startPose = { x: worldX, y: worldY } as TPose;
    const ctx: GestureContext<TPose> = {
      draggedIds: [GID],
      origin: new Map([[GID, startPose]]),
      current: new Map([[GID, startPose]]),
      snap: null,
      modifiers,
      pointer: { worldX, worldY, clientX: 0, clientY: 0 },
      adapter: adapter as unknown as GestureContext<TPose>['adapter'],
      scratch: {},
    };
    for (const b of behaviorsRef.current) b.onStart?.(ctx);
    stateRef.current = { active: true, ctx };
    onGestureStart?.();
    const snappedStart = ctx.origin.get(GID)!;
    setOverlay({ start: snappedStart, current: snappedStart });
  }, [adapter, onGestureStart]);

  const move = useCallback((worldX: number, worldY: number, modifiers: ModifierState): boolean => {
    const s = stateRef.current;
    if (!s.active || !s.ctx) return false;
    const ctx = s.ctx;
    ctx.modifiers = modifiers;
    ctx.pointer = { worldX, worldY, clientX: 0, clientY: 0 };
    let current = { ...(ctx.current.get(GID) as TPose), x: worldX, y: worldY } as TPose;
    let startPose = ctx.origin.get(GID)!;

    for (const b of behaviorsRef.current) {
      const r = b.onMove?.(ctx, { start: startPose, current });
      if (!r) continue;
      if (r.current !== undefined) current = r.current;
      if (r.start !== undefined) {
        startPose = r.start;
        ctx.origin.set(GID, startPose);
      }
    }
    ctx.current.set(GID, current);
    setOverlay({ start: startPose, current });
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
    const sp = ctx.origin.get(GID)!;
    const cp = ctx.current.get(GID)!;
    const x = Math.min(sp.x, cp.x);
    const y = Math.min(sp.y, cp.y);
    const width = Math.abs(cp.x - sp.x);
    const height = Math.abs(cp.y - sp.y);
    if (width <= minBounds.width || height <= minBounds.height) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }
    const created = adapter.commitInsert({ x, y, width, height });
    if (!created) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }
    const ops: Op[] = [createInsertOp({ object: created, label: insertLabel })];
    adapter.applyBatch(ops, insertLabel);
    cleanup();
    onGestureEnd?.(true);
  }, [adapter, cleanup, insertLabel, minBounds.width, minBounds.height, onGestureEnd]);

  const cancel = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  return { start, move, end, cancel, isInserting: overlay !== null, overlay };
}
