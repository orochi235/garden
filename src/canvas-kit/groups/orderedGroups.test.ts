import { describe, expect, it } from 'vitest';
import { withGroupOrdering } from './orderedGroups';
import type { Group, GroupAdapter } from './types';

interface MiniSceneAdapter {
  rootChildren: string[];
  getChildren(parentId: string | null): string[];
  setChildOrder(parentId: string | null, ids: string[]): void;
}

function makeGroupAdapter(groups: Record<string, Group>): GroupAdapter {
  return {
    getGroup: (id) => groups[id],
    getGroupsForMember: () => [],
    insertGroup: (g) => { groups[g.id] = g; },
    removeGroup: (id) => { delete groups[id]; },
    addToGroup: (gid, ids) => { groups[gid].members.push(...ids); },
    removeFromGroup: (gid, ids) => {
      groups[gid].members = groups[gid].members.filter((m) => !ids.includes(m));
    },
  };
}

describe('withGroupOrdering', () => {
  it('routes getChildren(groupId) to the group\'s members array', () => {
    const groups: Record<string, Group> = { g1: { id: 'g1', members: ['a', 'b', 'c'] } };
    const ga = makeGroupAdapter(groups);
    const scene: MiniSceneAdapter = {
      rootChildren: ['g1'],
      getChildren(parentId) { return parentId === null ? this.rootChildren.slice() : []; },
      setChildOrder(parentId, ids) { if (parentId === null) this.rootChildren = ids.slice(); },
    };
    const wrapped = withGroupOrdering(scene, ga);
    expect(wrapped.getChildren('g1')).toEqual(['a', 'b', 'c']);
    expect(wrapped.getChildren(null)).toEqual(['g1']);
  });

  it('routes setChildOrder(groupId) into the group\'s members', () => {
    const groups: Record<string, Group> = { g1: { id: 'g1', members: ['a', 'b', 'c'] } };
    const ga = makeGroupAdapter(groups);
    const scene: MiniSceneAdapter = {
      rootChildren: ['g1'],
      getChildren() { return []; },
      setChildOrder() {},
    };
    const wrapped = withGroupOrdering(scene, ga);
    wrapped.setChildOrder('g1', ['c', 'a', 'b']);
    expect(groups.g1.members).toEqual(['c', 'a', 'b']);
  });

  it('falls through to the underlying scene adapter for non-group parents', () => {
    const ga = makeGroupAdapter({});
    const scene: MiniSceneAdapter = {
      rootChildren: ['x'],
      getChildren(parentId) { return parentId === null ? this.rootChildren : []; },
      setChildOrder(parentId, ids) { if (parentId === null) this.rootChildren = ids.slice(); },
    };
    const wrapped = withGroupOrdering(scene, ga);
    wrapped.setChildOrder(null, ['x']);
    expect(scene.rootChildren).toEqual(['x']);
  });
});
