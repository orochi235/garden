import type { Op } from './types';
import { createDeleteOp } from './delete';

interface CreateAdapter<TObject> {
  insertObject(object: TObject): void;
}

export function createCreateOp<TObject extends { id: string }>(args: {
  object: TObject;
  label?: string;
}): Op {
  const { object, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as CreateAdapter<TObject>).insertObject(object);
    },
    invert() {
      return createDeleteOp({ object, label });
    },
  };
}
