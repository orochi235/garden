/**
 * Virtual groups — organizational lassos around N peer objects, distinct
 * from the structural parent/child hierarchy (`getParent`/`setParent`).
 *
 * A group has no transform, no pose, no parent — its bounds are computed
 * from its members on the fly. A group's id flows through ops and selection
 * like any other scene object id.
 *
 * Properties:
 *   - First-class ids: groups appear in selection just like leaf objects.
 *   - Multi-membership: an object can belong to multiple groups.
 *   - Nestable: a group's id can appear as a member of another group.
 */

/** A virtual group is identified by string id, same shape as scene objects. */
export interface Group {
  id: string;
  /** Ordered member ids; can include other group ids (nesting). */
  members: string[];
}

/**
 * Adapter additions for groups. The kit's existing adapter interfaces do
 * NOT require these — `GroupAdapter` is an opt-in extension that ops and
 * helpers cast to when a consumer enables groups.
 */
export interface GroupAdapter {
  /** Return the group with this id, or undefined if it isn't a group. */
  getGroup(id: string): Group | undefined;
  /** Return all groups this object is a *direct* member of (not transitive). */
  getGroupsForMember(id: string): string[];
  /** Insert a group record. */
  insertGroup(group: Group): void;
  /** Remove a group record by id. */
  removeGroup(id: string): void;
  /** Append ids to a group's member list. */
  addToGroup(groupId: string, ids: string[]): void;
  /** Remove ids from a group's member list. */
  removeFromGroup(groupId: string, ids: string[]): void;
}
