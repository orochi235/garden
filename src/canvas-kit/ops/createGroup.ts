import type { Op } from './types';
import type { Group, GroupAdapter } from '../groups/types';
import { createDissolveGroupOp } from './dissolveGroup';

/**
 * Insert a new virtual group. Inverts to a dissolve op holding the same
 * snapshot, so undo restores nothing about members beyond removing the
 * group record.
 */
export function createCreateGroupOp(args: { group: Group; label?: string }): Op {
  const { group, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as GroupAdapter).insertGroup(group);
    },
    invert() {
      return createDissolveGroupOp({ group, label });
    },
  };
}
