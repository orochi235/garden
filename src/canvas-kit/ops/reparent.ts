import type { Op } from './types';

interface ReparentAdapter {
  setParent(id: string, parentId: string | null): void;
}

/** Op: change `id`'s parent, inverting back to `from`. */
export function createReparentOp(args: {
  id: string;
  from: string | null;
  to: string | null;
  label?: string;
}): Op {
  const { id, from, to, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as ReparentAdapter).setParent(id, to);
    },
    invert() {
      return createReparentOp({ id, from: to, to: from, label });
    },
  };
}
