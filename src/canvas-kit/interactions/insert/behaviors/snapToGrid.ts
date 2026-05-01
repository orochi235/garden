import type {
  InsertBehavior,
  ModifierState,
} from '../../types';

type ModKey = keyof ModifierState;

export function snapToGrid<TPose extends { x: number; y: number }>(args: {
  cell: number;
  bypassKey?: ModKey;
}): InsertBehavior<TPose> {
  const { cell, bypassKey } = args;
  const round = (v: number) => Math.round(v / cell) * cell;
  return {
    onStart(ctx) {
      if (bypassKey && ctx.modifiers[bypassKey]) return;
      const id = ctx.draggedIds[0];
      const o = ctx.origin.get(id);
      if (!o) return;
      ctx.origin.set(id, { ...o, x: round(o.x), y: round(o.y) } as TPose);
    },
    onMove(ctx, { current }) {
      if (bypassKey && ctx.modifiers[bypassKey]) return;
      return { current: { ...current, x: round(current.x), y: round(current.y) } as TPose };
    },
  };
}
