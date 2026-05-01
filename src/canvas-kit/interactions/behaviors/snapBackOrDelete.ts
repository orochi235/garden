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
        const obj = (ctx.adapter as unknown as {
          getObject?(id: string): { id: string } | undefined;
        }).getObject?.(id);
        if (!obj) return;
        const ops: Op[] = [createDeleteOp({ object: obj, label: deleteLabel })];
        return ops;
      }
      return;
    },
  };
}
