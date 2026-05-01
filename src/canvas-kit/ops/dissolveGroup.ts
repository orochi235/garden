import type { Op } from './types';
import type { Group, GroupAdapter } from '../groups/types';
import { createCreateGroupOp } from './createGroup';

/**
 * Remove a virtual group. Stores the full group snapshot for revert so
 * undo can restore the exact member list.
 */
export function createDissolveGroupOp(args: { group: Group; label?: string }): Op {
  const { group, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as GroupAdapter).removeGroup(group.id);
    },
    invert() {
      return createCreateGroupOp({ group, label });
    },
  };
}
