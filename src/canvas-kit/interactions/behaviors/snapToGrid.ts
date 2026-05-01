import type { MoveBehavior, ModifierState } from '../types';

type ModKey = keyof ModifierState;

export function snapToGrid<TPose extends { x: number; y: number }>(args: {
  cellFt: number;
  bypassKey?: ModKey;
}): MoveBehavior<TPose> {
  const { cellFt, bypassKey } = args;
  return {
    onMove(ctx, proposed) {
      if (bypassKey && ctx.modifiers[bypassKey]) return;
      return {
        pose: {
          ...proposed,
          x: Math.round(proposed.x / cellFt) * cellFt,
          y: Math.round(proposed.y / cellFt) * cellFt,
        },
      };
    },
  };
}
