import { useCallback, useRef, useState } from 'react';
import { createTransformOp } from '../../ops/transform';
import type { Op } from '../../ops/types';
import type { ResizeAdapter } from '../../adapters/types';
import type {
  GestureContext,
  ModifierState,
  ResizeAnchor,
  ResizeBehavior,
  ResizeOverlay,
  ResizePose,
} from '../types';

const LERP = 0.35;

export interface UseResizeInteractionOptions<TPose extends ResizePose> {
  behaviors?: ResizeBehavior<TPose>[];
  resizeLabel?: string;
  onGestureStart?: (id: string) => void;
  onGestureEnd?: (committed: boolean) => void;
}

export interface UseResizeInteractionReturn<TPose extends ResizePose> {
  start(id: string, anchor: ResizeAnchor, worldX: number, worldY: number): void;
  move(worldX: number, worldY: number, modifiers: ModifierState): boolean;
  end(): void;
  cancel(): void;
  isResizing: boolean;
  overlay: ResizeOverlay<TPose> | null;
}

interface State<TPose extends ResizePose> {
  active: boolean;
  id: string | null;
  anchor: ResizeAnchor;
  origin: TPose | null;
  start: { worldX: number; worldY: number };
  ctx: GestureContext<TPose> | null;
  lastCurrent: TPose | null;
}

export function useResizeInteraction<TObject extends { id: string }, TPose extends ResizePose>(
  adapter: ResizeAdapter<TObject, TPose>,
  options: UseResizeInteractionOptions<TPose>,
): UseResizeInteractionReturn<TPose> {
  const {
    behaviors = [],
    resizeLabel = 'Resize',
    onGestureStart,
    onGestureEnd,
  } = options;

  const behaviorsRef = useRef(behaviors);
  behaviorsRef.current = behaviors;

  const stateRef = useRef<State<TPose>>({
    active: false,
    id: null,
    anchor: { x: 'free', y: 'free' },
    origin: null,
    start: { worldX: 0, worldY: 0 },
    ctx: null,
    lastCurrent: null,
  });

  const [overlay, setOverlay] = useState<ResizeOverlay<TPose> | null>(null);

  const cleanup = useCallback(() => {
    stateRef.current.active = false;
    stateRef.current.id = null;
    stateRef.current.origin = null;
    stateRef.current.ctx = null;
    stateRef.current.lastCurrent = null;
    setOverlay(null);
  }, []);

  const start = useCallback((id: string, anchor: ResizeAnchor, worldX: number, worldY: number) => {
    const origin = adapter.getPose(id);
    const ctx: GestureContext<TPose> = {
      draggedIds: [id],
      origin: new Map([[id, origin]]),
      current: new Map([[id, origin]]),
      snap: null,
      modifiers: { alt: false, shift: false, meta: false, ctrl: false },
      pointer: { worldX, worldY, clientX: 0, clientY: 0 },
      adapter: adapter as unknown as GestureContext<TPose>['adapter'],
      scratch: {},
    };
    stateRef.current = {
      active: true,
      id,
      anchor,
      origin,
      start: { worldX, worldY },
      ctx,
      lastCurrent: origin,
    };
    for (const b of behaviorsRef.current) b.onStart?.(ctx);
    onGestureStart?.(id);
    setOverlay({ id, currentPose: origin, targetPose: origin, anchor });
  }, [adapter, onGestureStart]);

  const move = useCallback((worldX: number, worldY: number, modifiers: ModifierState): boolean => {
    const s = stateRef.current;
    if (!s.active || !s.ctx || !s.origin || !s.id) return false;

    s.ctx.modifiers = modifiers;
    s.ctx.pointer = { worldX, worldY, clientX: 0, clientY: 0 };

    const dx = worldX - s.start.worldX;
    const dy = worldY - s.start.worldY;
    const o = s.origin;

    let nx = o.x;
    let ny = o.y;
    let nw = o.width;
    let nh = o.height;
    if (s.anchor.x === 'min') {
      nw = o.width + dx;
    } else if (s.anchor.x === 'max') {
      nx = o.x + dx;
      nw = o.width - dx;
    }
    if (s.anchor.y === 'min') {
      nh = o.height + dy;
    } else if (s.anchor.y === 'max') {
      ny = o.y + dy;
      nh = o.height - dy;
    }
    let proposed: TPose = { ...o, x: nx, y: ny, width: nw, height: nh };

    for (const b of behaviorsRef.current) {
      const r = b.onMove?.(s.ctx, { pose: proposed, anchor: s.anchor });
      if (!r) continue;
      if (r.pose !== undefined) proposed = r.pose;
    }

    s.ctx.current = new Map([[s.id, proposed]]);

    const last = s.lastCurrent ?? o;
    const lerp = (a: number, b: number) => a + (b - a) * LERP;
    const currentPose: TPose = {
      ...proposed,
      x: lerp(last.x, proposed.x),
      y: lerp(last.y, proposed.y),
      width: lerp(last.width, proposed.width),
      height: lerp(last.height, proposed.height),
    };
    s.lastCurrent = currentPose;

    setOverlay({ id: s.id, currentPose, targetPose: proposed, anchor: s.anchor });
    return true;
  }, []);

  const end = useCallback(() => {
    const s = stateRef.current;
    if (!s.active || !s.ctx || !s.origin || !s.id) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }
    const ctx = s.ctx;
    const targetPose = ctx.current.get(s.id) ?? s.origin;

    const moved =
      targetPose.x !== s.origin.x ||
      targetPose.y !== s.origin.y ||
      targetPose.width !== s.origin.width ||
      targetPose.height !== s.origin.height;

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
      if (!moved) {
        cleanup();
        onGestureEnd?.(false);
        return;
      }
      ops = [
        createTransformOp<TPose>({
          id: s.id,
          from: s.origin,
          to: targetPose,
          label: resizeLabel,
        }),
      ];
    }
    if (ops.length > 0) {
      adapter.applyBatch(ops, ops[0].label ?? resizeLabel);
    }
    cleanup();
    onGestureEnd?.(true);
  }, [adapter, cleanup, onGestureEnd, resizeLabel]);

  const cancel = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  return { start, move, end, cancel, isResizing: overlay !== null, overlay };
}
