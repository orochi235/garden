import type {
  ModifierState,
  ResizeBehavior,
  ResizePose,
} from '../../types';

type ModKey = keyof ModifierState;

export function snapToGrid<TPose extends ResizePose>(args: {
  cell: number;
  bypassKey?: ModKey;
  suspendBelowDim?: boolean;
}): ResizeBehavior<TPose> {
  const { cell, bypassKey, suspendBelowDim = true } = args;
  const round = (v: number) => Math.round(v / cell) * cell;

  return {
    onMove(ctx, { pose, anchor }) {
      if (bypassKey && ctx.modifiers[bypassKey]) return;
      const origin = ctx.origin.get(ctx.draggedIds[0])!;
      const subX = suspendBelowDim && origin.width < cell;
      const subY = suspendBelowDim && origin.height < cell;

      let { x, y, width, height } = pose;
      let changed = false;

      if (anchor.x !== 'free' && !subX) {
        if (anchor.x === 'min') {
          // East edge moves; west (x) stays.
          const east = round(x + width);
          width = east - x;
        } else {
          // West edge moves; east (x+width) stays.
          const right = origin.x + origin.width;
          const newX = round(x);
          width = right - newX;
          x = newX;
        }
        changed = true;
      }
      if (anchor.y !== 'free' && !subY) {
        if (anchor.y === 'min') {
          const south = round(y + height);
          height = south - y;
        } else {
          const bottom = origin.y + origin.height;
          const newY = round(y);
          height = bottom - newY;
          y = newY;
        }
        changed = true;
      }
      if (!changed) return;
      return { pose: { ...pose, x, y, width, height } };
    },
  };
}
