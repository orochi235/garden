import type { Op } from './types';
import type { GroupAdapter } from '../groups/types';
import { createAddToGroupOp } from './addToGroup';

/** Remove ids from an existing group's member list. Inverts to add. */
export function createRemoveFromGroupOp(args: {
  groupId: string;
  ids: string[];
  label?: string;
}): Op {
  const { groupId, ids, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as GroupAdapter).removeFromGroup(groupId, ids);
    },
    invert() {
      return createAddToGroupOp({ groupId, ids, label });
    },
  };
}
