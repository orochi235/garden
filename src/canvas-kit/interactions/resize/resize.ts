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
  /** Reserved; resize is never transient in practice. Ignored. */
  transient?: boolean;
  onGestureStart?: (id: string) => void;
  onGestureEnd?: (committed: boolean) => void;
  /** Optional: expand the incoming id into leaf ids before pose lookups.
   *  Mirrors `useMoveInteraction`'s `expandIds`. Used for virtual-group
   *  expansion: when the gesture is started against a group id, the kit
   *  resizes by computing the union AABB of the leaves' origin poses,
   *  running the compute pipeline on that union rect (group bounds), and
   *  scaling each leaf proportionally against origin/proposed group rects.
   *
   *  When `expandIds` is omitted or returns the original single id, the
   *  gesture takes the single-leaf path (unchanged from non-group resize).
   *
   *  Called once at `start()`. Returning `[]` aborts the gesture cleanly. */
  expandIds?: (ids: string[]) => string[];
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
  /** The id passed to `start()`. For a group resize this is the group id. */
  id: string | null;
  anchor: ResizeAnchor;
  /** Origin pose threaded through the compute pipeline. For a single-leaf
   *  resize this is the leaf's pose; for a group resize it is the union
   *  AABB of the leaves' origin poses. */
  origin: TPose | null;
  start: { worldX: number; worldY: number };
  ctx: GestureContext<TPose> | null;
  lastCurrent: TPose | null;
  /** Non-null only when expandIds produced a group expansion (>1 leaf). */
  leafIds: string[] | null;
  leafOrigins: Map<string, TPose> | null;
  /** Last proposed per-leaf poses (set during move). Used by end() to
   *  emit one transform op per leaf without recomputing scale. */
  leafTargets: Map<string, TPose> | null;
}

/** Compute the union AABB of N poses. Caller guarantees `poses.length >= 1`. */
function computeUnionBounds<TPose extends ResizePose>(poses: TPose[]): TPose {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poses) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + p.width > maxX) maxX = p.x + p.width;
    if (p.y + p.height > maxY) maxY = p.y + p.height;
  }
  // Carry forward the first pose's other fields so the kit doesn't drop
  // app-specific TPose properties as the union rect flows through behaviors.
  return { ...poses[0], x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Scale a leaf pose against origin/proposed group rects. Zero-axis-extent
 *  groups are scaled by 1 on that axis to avoid NaN. */
function scaleLeafPose<TPose extends ResizePose>(
  leaf: TPose,
  origin: ResizePose,
  proposed: ResizePose,
): TPose {
  const sx = origin.width === 0 ? 1 : proposed.width / origin.width;
  const sy = origin.height === 0 ? 1 : proposed.height / origin.height;
  return {
    ...leaf,
    x: proposed.x + (leaf.x - origin.x) * sx,
    y: proposed.y + (leaf.y - origin.y) * sy,
    width: leaf.width * sx,
    height: leaf.height * sy,
  };
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
    expandIds,
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
    leafIds: null,
    leafOrigins: null,
    leafTargets: null,
  });

  const [overlay, setOverlay] = useState<ResizeOverlay<TPose> | null>(null);

  const cleanup = useCallback(() => {
    stateRef.current.active = false;
    stateRef.current.id = null;
    stateRef.current.origin = null;
    stateRef.current.ctx = null;
    stateRef.current.lastCurrent = null;
    stateRef.current.leafIds = null;
    stateRef.current.leafOrigins = null;
    stateRef.current.leafTargets = null;
    setOverlay(null);
  }, []);

  const start = useCallback((id: string, anchor: ResizeAnchor, worldX: number, worldY: number) => {
    const expanded = expandIds ? expandIds([id]) : [id];
    if (expanded.length === 0) {
      // Aborted before activation.
      stateRef.current.active = false;
      return;
    }

    let origin: TPose;
    let leafIds: string[] | null = null;
    let leafOrigins: Map<string, TPose> | null = null;

    if (expanded.length === 1 && expanded[0] === id) {
      // Single-leaf path: behavior unchanged from before expandIds existed.
      origin = adapter.getPose(id);
    } else {
      // Group path. `id` is the group id; its leaves carry the poses.
      leafIds = expanded;
      leafOrigins = new Map<string, TPose>();
      const leafPoses: TPose[] = [];
      for (const lid of expanded) {
        const lp = adapter.getPose(lid);
        leafOrigins.set(lid, lp);
        leafPoses.push(lp);
      }
      origin = computeUnionBounds(leafPoses);
    }

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
      leafIds,
      leafOrigins,
      leafTargets: null,
    };
    for (const b of behaviorsRef.current) b.onStart?.(ctx);
    onGestureStart?.(id);
    setOverlay({ id, currentPose: origin, targetPose: origin, anchor });
  }, [adapter, expandIds, onGestureStart]);

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

    let leafPoses: Map<string, TPose> | undefined;
    if (s.leafIds && s.leafOrigins) {
      leafPoses = new Map<string, TPose>();
      for (const lid of s.leafIds) {
        const lp = s.leafOrigins.get(lid)!;
        leafPoses.set(lid, scaleLeafPose(lp, o, proposed));
      }
      s.leafTargets = leafPoses;
    }

    setOverlay({ id: s.id, currentPose, targetPose: proposed, anchor: s.anchor, leafPoses });
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
      if (s.leafIds && s.leafOrigins) {
        // Group path: emit one transform op per leaf, recomputing per-leaf
        // scaled poses from the final group target so end() doesn't depend
        // on whether move() ran most recently.
        ops = [];
        for (const lid of s.leafIds) {
          const lp = s.leafOrigins.get(lid)!;
          const to = s.leafTargets?.get(lid) ?? scaleLeafPose(lp, s.origin, targetPose);
          ops.push(
            createTransformOp<TPose>({
              id: lid,
              from: lp,
              to,
              label: resizeLabel,
            }),
          );
        }
      } else {
        ops = [
          createTransformOp<TPose>({
            id: s.id,
            from: s.origin,
            to: targetPose,
            label: resizeLabel,
          }),
        ];
      }
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
