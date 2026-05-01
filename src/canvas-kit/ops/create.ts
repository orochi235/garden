import type { Op } from './types';
import { createDeleteOp } from './delete';

interface InsertAdapter<TObject> {
  insertObject(object: TObject): void;
}

/** Type alias for ops produced by `createInsertOp`. Carries no extra type info today;
 *  exists so consumers can name the op type when needed. */
export type InsertOp = Op;

/** Op: insert `object` into the scene; inverts to a delete of the same id. */
export function createInsertOp<TObject extends { id: string }>(args: {
  object: TObject;
  label?: string;
}): InsertOp {
  const { object, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as InsertAdapter<TObject>).insertObject(object);
    },
    invert() {
      return createDeleteOp({ object, label });
    },
  };
}
