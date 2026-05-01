import type { Op } from './types';
import type { GroupAdapter } from '../groups/types';
import { createRemoveFromGroupOp } from './removeFromGroup';

/** Add ids to an existing group's member list. Inverts to remove. */
export function createAddToGroupOp(args: {
  groupId: string;
  ids: string[];
  label?: string;
}): Op {
  const { groupId, ids, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as GroupAdapter).addToGroup(groupId, ids);
    },
    invert() {
      return createRemoveFromGroupOp({ groupId, ids, label });
    },
  };
}
