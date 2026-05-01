import type { ResizeBehavior, ResizePose } from '../../types';

export function clampMinSize<TPose extends ResizePose>(args: {
  minWidth: number;
  minHeight: number;
}): ResizeBehavior<TPose> {
  const { minWidth, minHeight } = args;
  return {
    onMove(_ctx, { pose, anchor }) {
      let { x, y, width, height } = pose;
      let changed = false;
      if (anchor.x !== 'free' && width < minWidth) {
        if (anchor.x === 'min') {
          // West edge is anchor; east edge was dragged. Hold x; widen to min.
          width = minWidth;
        } else {
          // East edge is anchor at originalRight = x + width. Hold the right;
          // shift x left so width = minWidth.
          const right = x + width;
          x = right - minWidth;
          width = minWidth;
        }
        changed = true;
      }
      if (anchor.y !== 'free' && height < minHeight) {
        if (anchor.y === 'min') {
          height = minHeight;
        } else {
          const bottom = y + height;
          y = bottom - minHeight;
          height = minHeight;
        }
        changed = true;
      }
      if (!changed) return;
      return { pose: { ...pose, x, y, width, height } };
    },
  };
}
