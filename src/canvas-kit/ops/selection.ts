import type { Op } from './types';

interface SelectionAdapter {
  setSelection(ids: string[]): void;
}

export function createSetSelectionOp(args: {
  from: string[];
  to: string[];
  label?: string;
}): Op {
  const { from, to, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as SelectionAdapter).setSelection(to);
    },
    invert() {
      return createSetSelectionOp({ from: to, to: from, label });
    },
  };
}
