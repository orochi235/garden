import type { Op } from './types';
import { createInsertOp } from './create';

interface DeleteAdapter {
  removeObject(id: string): void;
}

export function createDeleteOp<TObject extends { id: string }>(args: {
  object: TObject;
  label?: string;
}): Op {
  const { object, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as DeleteAdapter).removeObject(object.id);
    },
    invert() {
      return createInsertOp({ object, label });
    },
  };
}
