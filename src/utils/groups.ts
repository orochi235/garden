import type { Structure } from '../model/types';

/**
 * Expand a set of structure ids to include all siblings sharing a non-null
 * `groupId`. Ungrouped ids and ids not present in `structures` pass through
 * unchanged. Output is deduplicated; ordering is input-order then siblings
 * appended in their `structures` order.
 *
 * Used by the select tool so dragging or marquee-selecting one member of a
 * group acts on all members. Selection in the UI store is intentionally NOT
 * widened — the click target keeps its single-handle resize affordance.
 */
export function expandToGroups(ids: Iterable<string>, structures: Structure[]): string[] {
  const byId = new Map<string, Structure>();
  for (const s of structures) byId.set(s.id, s);

  const groupIds = new Set<string>();
  const result: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    result.push(id);
  };

  for (const id of ids) {
    push(id);
    const s = byId.get(id);
    if (s && s.groupId !== null) groupIds.add(s.groupId);
  }
  if (groupIds.size === 0) return result;

  for (const s of structures) {
    if (s.groupId !== null && groupIds.has(s.groupId)) push(s.id);
  }
  return result;
}
