import { createTransformOp } from '../../ops/transform';
import { createReparentOp } from '../../ops/reparent';
import type { Op } from '../../ops/types';
import type { SnapTarget } from '../../adapters/types';
import type { MoveBehavior, GestureContext } from '../types';

interface SnapState<TPose> {
  pendingTargetId: string | null;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  committedSnap: SnapTarget<TPose> | null;
}

const KEY = 'snapToContainer';

function getState<TPose>(ctx: GestureContext<TPose>): SnapState<TPose> {
  let s = ctx.scratch[KEY] as SnapState<TPose> | undefined;
  if (!s) {
    s = { pendingTargetId: null, pendingTimer: null, committedSnap: null };
    ctx.scratch[KEY] = s;
  }
  return s;
}

function clearTimer<TPose>(s: SnapState<TPose>) {
  if (s.pendingTimer !== null) {
    clearTimeout(s.pendingTimer);
    s.pendingTimer = null;
  }
  s.pendingTargetId = null;
}

export function snapToContainer<TPose extends { x: number; y: number }>(args: {
  dwellMs: number;
  findTarget: (
    draggedId: string,
    worldX: number,
    worldY: number,
  ) => SnapTarget<TPose> | null;
  isInstant?: (target: SnapTarget<TPose>) => boolean;
  moveLabel?: string;
  reparentLabel?: string;
}): MoveBehavior<TPose> {
  const { dwellMs, findTarget, isInstant, moveLabel = 'Move', reparentLabel = 'Move and reparent' } = args;

  return {
    onMove(ctx, _proposed) {
      const s = getState<TPose>(ctx);
      const target = findTarget(ctx.draggedIds[0], ctx.pointer.worldX, ctx.pointer.worldY);

      if (s.committedSnap) {
        if (target && target.parentId === s.committedSnap.parentId) {
          return { pose: s.committedSnap.slotPose, snap: s.committedSnap };
        }
        s.committedSnap = null;
      }

      if (!target) {
        clearTimer(s);
        return;
      }

      if (isInstant?.(target)) {
        clearTimer(s);
        s.committedSnap = target;
        return { pose: target.slotPose, snap: target };
      }

      if (s.pendingTargetId === target.parentId) {
        return;
      }
      clearTimer(s);
      s.pendingTargetId = target.parentId;
      s.pendingTimer = setTimeout(() => {
        s.committedSnap = target;
        s.pendingTimer = null;
      }, dwellMs);
      return;
    },

    onEnd(ctx) {
      const s = getState<TPose>(ctx);
      clearTimer(s);
      const snap = s.committedSnap ?? ctx.snap;
      if (!snap) return;
      const draggedId = ctx.draggedIds[0];
      const oldParent = ctx.adapter.getParent(draggedId);
      const fromPose = ctx.origin.get(draggedId)!;
      const ops: Op[] = [
        createTransformOp<TPose>({
          id: draggedId,
          from: fromPose,
          to: snap.slotPose,
          label: moveLabel,
        }),
      ];
      if (oldParent !== snap.parentId) {
        ops.push(createReparentOp({
          id: draggedId,
          from: oldParent,
          to: snap.parentId,
          label: reparentLabel,
        }));
      }
      return ops;
    },
  };
}
