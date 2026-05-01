import type { GroupAdapter } from './types';

/**
 * Walks parent groups for `id` and returns the outermost ancestor group id,
 * or `id` itself if it's not a member of any group.
 *
 * "Outermost" = the group that is itself not a member of any other group.
 * If `id` is in multiple disjoint root groups (rare), returns the first by
 * insertion order in `getGroupsForMember`.
 *
 * Acyclic-safe: uses a visited-set guard. If a cycle is encountered the
 * walk terminates and the deepest non-cyclic ancestor seen so far is
 * returned.
 */
export function resolveToOutermostGroup(id: string, adapter: GroupAdapter): string {
  const visited = new Set<string>();
  let current = id;
  visited.add(current);
  while (true) {
    const parents = adapter.getGroupsForMember(current);
    if (parents.length === 0) return current;
    // Pick the first parent that hasn't been visited.
    const next = parents.find((p) => !visited.has(p));
    if (next === undefined) return current; // cycle — bail
    visited.add(next);
    current = next;
  }
}

/**
 * Given a list of ids (some of which may be groups), return the flattened
 * list of leaf object ids by recursively expanding group memberships.
 * Skips groups themselves; only returns ids that are NOT groups.
 *
 * Used in later phases to translate "user selected this group" into
 * "gesture should operate on these N leaves."
 *
 * Acyclic-safe: a visited-set guard prevents infinite recursion on cyclic
 * group references; cyclic edges are simply skipped.
 */
export function expandToLeaves(ids: string[], adapter: GroupAdapter): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const group = adapter.getGroup(id);
    if (group === undefined) {
      out.push(id);
      return;
    }
    for (const m of group.members) visit(m);
  };
  for (const id of ids) visit(id);
  return out;
}
