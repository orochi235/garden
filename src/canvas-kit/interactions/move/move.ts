import { useRef, useState, useCallback } from 'react';
import { createTransformOp } from '../../ops/transform';
import type { Op } from '../../ops/types';
import type { MoveAdapter, SnapTarget } from '../../adapters/types';
import type { GestureContext, MoveBehavior, MoveOverlay, ModifierState } from '../types';

export interface UseMoveInteractionOptions<TPose> {
  translatePose: (pose: TPose, dx: number, dy: number) => TPose;
  behaviors?: MoveBehavior<TPose>[];
  dragThresholdPx?: number;
  moveLabel?: string;
  onGestureStart?(ids: string[]): void;
  onGestureEnd?(committed: boolean): void;
}

export interface MoveStartArgs {
  ids: string[];
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
}

export interface MoveMoveArgs {
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
  modifiers: ModifierState;
}

export interface UseMoveInteractionReturn<TPose> {
  start(args: MoveStartArgs): void;
  move(args: MoveMoveArgs): boolean;
  end(): void;
  cancel(): void;
  isActive(): boolean;
  overlay: MoveOverlay<TPose> | null;
}

export function useMoveInteraction<TObject extends { id: string }, TPose>(
  adapter: MoveAdapter<TObject, TPose>,
  options: UseMoveInteractionOptions<TPose>,
): UseMoveInteractionReturn<TPose> {
  const {
    translatePose,
    behaviors = [],
    dragThresholdPx = 4,
    moveLabel = 'Move',
    onGestureStart,
    onGestureEnd,
  } = options;

  const behaviorsRef = useRef(behaviors);
  behaviorsRef.current = behaviors;

  const stateRef = useRef<{
    phase: 'idle' | 'pending' | 'active';
    startWorld: { x: number; y: number };
    startClient: { x: number; y: number };
    ctx: GestureContext<TPose, TObject> | null;
  }>({
    phase: 'idle',
    startWorld: { x: 0, y: 0 },
    startClient: { x: 0, y: 0 },
    ctx: null,
  });

  const [overlay, setOverlay] = useState<MoveOverlay<TPose> | null>(null);

  const cleanup = useCallback(() => {
    stateRef.current.phase = 'idle';
    stateRef.current.ctx = null;
    setOverlay(null);
  }, []);

  const start = useCallback((args: MoveStartArgs) => {
    const origin = new Map<string, TPose>();
    for (const id of args.ids) origin.set(id, adapter.getPose(id));
    stateRef.current = {
      phase: 'pending',
      startWorld: { x: args.worldX, y: args.worldY },
      startClient: { x: args.clientX, y: args.clientY },
      ctx: {
        draggedIds: args.ids,
        origin,
        current: new Map(origin),
        snap: null,
        modifiers: { alt: false, shift: false, meta: false, ctrl: false },
        pointer: { worldX: args.worldX, worldY: args.worldY, clientX: args.clientX, clientY: args.clientY },
        adapter,
        scratch: {},
      },
    };
  }, [adapter]);

  const move = useCallback((args: MoveMoveArgs): boolean => {
    const s = stateRef.current;
    if (s.phase === 'idle' || !s.ctx) return false;

    if (s.phase === 'pending') {
      const dxs = args.clientX - s.startClient.x;
      const dys = args.clientY - s.startClient.y;
      if (dxs * dxs + dys * dys < dragThresholdPx * dragThresholdPx) return true;
      s.phase = 'active';
      onGestureStart?.(s.ctx.draggedIds);
      for (const b of behaviorsRef.current) b.onStart?.(s.ctx);
    }

    const ctx = s.ctx;
    ctx.modifiers = args.modifiers;
    ctx.pointer = { worldX: args.worldX, worldY: args.worldY, clientX: args.clientX, clientY: args.clientY };

    const dx = args.worldX - s.startWorld.x;
    const dy = args.worldY - s.startWorld.y;

    const newPoses = new Map<string, TPose>();
    let snap: SnapTarget<TPose> | null = ctx.snap;

    for (const id of ctx.draggedIds) {
      const originPose = ctx.origin.get(id)!;
      let proposed = translatePose(originPose, dx, dy);
      // Behaviors run only against the primary id (first in the array).
      // For multi-select group drag, secondary ids share the same delta.
      if (id === ctx.draggedIds[0]) {
        for (const b of behaviorsRef.current) {
          const r = b.onMove?.(ctx, proposed);
          if (!r) continue;
          if (r.pose !== undefined) proposed = r.pose;
          if (r.snap !== undefined) snap = r.snap;
        }
      }
      newPoses.set(id, proposed);
    }

    ctx.current = newPoses;
    ctx.snap = snap;
    setOverlay({ draggedIds: ctx.draggedIds, poses: newPoses, snapped: snap, hideIds: ctx.draggedIds });
    return true;
  }, [adapter, dragThresholdPx, onGestureStart, translatePose]);

  const end = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== 'active' || !s.ctx) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }
    const ctx = s.ctx;

    let ops: Op[] | null | undefined;
    for (const b of behaviorsRef.current) {
      const r = b.onEnd?.(ctx);
      if (r === undefined) continue;
      ops = r;
      break;
    }

    if (ops === null) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }

    if (ops === undefined) {
      ops = ctx.draggedIds.map((id) =>
        createTransformOp<TPose>({
          id,
          from: ctx.origin.get(id)!,
          to: ctx.current.get(id)!,
          label: moveLabel,
        }),
      );
    }

    if (ops.length > 0) {
      adapter.applyBatch(ops, ops[0].label ?? moveLabel);
    }
    cleanup();
    onGestureEnd?.(true);
  }, [adapter, cleanup, moveLabel, onGestureEnd]);

  const cancel = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  const isActive = useCallback(() => stateRef.current.phase === 'active', []);

  return { start, move, end, cancel, isActive, overlay };
}
