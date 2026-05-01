import { createInsertOp } from '../../../ops/create';
import { createSetSelectionOp } from '../../../ops/selection';
import type { CloneBehavior } from '../../types';

/** Clone-on-alt-drag behavior for `useCloneInteraction`; activates when Alt/Option is held at drag start. */
export function cloneByAltDrag(): CloneBehavior {
  return {
    id: 'cloneByAltDrag',
    activates: (mods) => mods.alt === true,
    onEnd(pose, ctx) {
      const snap = ctx.adapter.snapshotSelection(pose.ids);
      const created = ctx.adapter.commitPaste(snap, pose.offset, {
        dropPoint: { worldX: pose.worldX, worldY: pose.worldY },
      });
      if (created.length === 0) return [];
      const newIds = created.map((o: { id: string }) => o.id);
      const from = ctx.adapter.getSelection?.() ?? [];
      return [
        ...created.map((o) => createInsertOp({ object: o })),
        createSetSelectionOp({ from, to: newIds }),
      ];
    },
  };
}
