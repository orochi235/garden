import type { Op } from './types';

interface TransformAdapter<TPose> {
  setPose(id: string, pose: TPose): void;
}

/** Op: set an object's pose, inverting back to `from`. Optionally tag with `coalesceKey` for batch merging. */
export function createTransformOp<TPose>(args: {
  id: string;
  from: TPose;
  to: TPose;
  label?: string;
  coalesceKey?: string;
}): Op {
  const { id, from, to, label, coalesceKey } = args;
  return {
    label,
    coalesceKey,
    apply(adapter) {
      (adapter as TransformAdapter<TPose>).setPose(id, to);
    },
    invert() {
      return createTransformOp<TPose>({ id, from: to, to: from, label, coalesceKey });
    },
  };
}
