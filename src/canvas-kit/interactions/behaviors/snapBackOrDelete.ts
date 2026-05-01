import { createDeleteOp } from '../../ops/delete';
import type { Op } from '../../ops/types';
import type { MoveBehavior } from '../types';

export function snapBackOrDelete<TPose extends { x: number; y: number }>(args: {
  radiusFt: number;
  onFreeRelease: 'snap-back' | 'delete';
  deleteLabel?: string;
}): MoveBehavior<TPose> {
  const { radiusFt, onFreeRelease, deleteLabel = 'Delete' } = args;
  const r2 = radiusFt * radiusFt;

  return {
    onStart(ctx) {
      // Snapshot the dragged objects at gesture start so delete can undo.
      const snapshots = new Map<string, { id: string }>();
      for (const id of ctx.draggedIds) {
        const obj = ctx.adapter.getObject(id) ?? { id };
        snapshots.set(id, obj);
      }
      ctx.scratch['snapBackOrDelete.snapshots'] = snapshots;
    },

    onEnd(ctx) {
      if (ctx.snap) return;
      const id = ctx.draggedIds[0];
      const origin = ctx.origin.get(id)!;
      const current = ctx.current.get(id)!;
      const dx = current.x - origin.x;
      const dy = current.y - origin.y;
      const within = dx * dx + dy * dy <= r2;
      if (within) {
        return null;
      }
      if (onFreeRelease === 'delete') {
        const snapshots = ctx.scratch['snapBackOrDelete.snapshots'] as
          | Map<string, { id: string }>
          | undefined;
        const obj = snapshots?.get(id) ?? { id };
        const ops: Op[] = [createDeleteOp({ object: obj, label: deleteLabel })];
        return ops;
      }
      return;
    },
  };
}
