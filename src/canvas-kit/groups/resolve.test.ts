import { describe, expect, it } from 'vitest';
import type { Group, GroupAdapter } from './types';
import { expandToLeaves, resolveToOutermostGroup } from './resolve';

function makeAdapter(groups: Group[]): GroupAdapter {
  const byId = new Map<string, Group>(groups.map((g) => [g.id, { ...g, members: [...g.members] }]));
  return {
    getGroup: (id) => byId.get(id),
    getGroupsForMember: (id) =>
      [...byId.values()].filter((g) => g.members.includes(id)).map((g) => g.id),
    insertGroup: (g) => byId.set(g.id, { ...g, members: [...g.members] }),
    removeGroup: (id) => void byId.delete(id),
    addToGroup: (gid, ids) => {
      const g = byId.get(gid);
      if (g) g.members.push(...ids);
    },
    removeFromGroup: (gid, ids) => {
      const g = byId.get(gid);
      if (g) g.members = g.members.filter((m) => !ids.includes(m));
    },
  };
}

describe('resolveToOutermostGroup', () => {
  it('returns id for a non-grouped object', () => {
    const adapter = makeAdapter([]);
    expect(resolveToOutermostGroup('a', adapter)).toBe('a');
  });

  it('returns the group id when in one group', () => {
    const adapter = makeAdapter([{ id: 'g1', members: ['a', 'b'] }]);
    expect(resolveToOutermostGroup('a', adapter)).toBe('g1');
  });

  it('returns outermost when in nested groups', () => {
    const adapter = makeAdapter([
      { id: 'g1', members: ['a'] },
      { id: 'g2', members: ['g1'] },
      { id: 'g3', members: ['g2'] },
    ]);
    expect(resolveToOutermostGroup('a', adapter)).toBe('g3');
  });

  it('picks the first root when multiple disjoint roots', () => {
    const adapter = makeAdapter([
      { id: 'gA', members: ['a'] },
      { id: 'gB', members: ['a'] },
    ]);
    const out = resolveToOutermostGroup('a', adapter);
    expect(['gA', 'gB']).toContain(out);
  });

  it('terminates on a membership cycle without infinite-looping', () => {
    // g1 contains a; g2 contains g1; pretend g1 also contains g2 (cycle)
    const adapter = makeAdapter([
      { id: 'g1', members: ['a', 'g2'] },
      { id: 'g2', members: ['g1'] },
    ]);
    // Should terminate; outcome is one of the cycle nodes.
    const out = resolveToOutermostGroup('a', adapter);
    expect(['g1', 'g2']).toContain(out);
  });
});

describe('expandToLeaves', () => {
  it('flattens a single-level group', () => {
    const adapter = makeAdapter([{ id: 'g1', members: ['a', 'b', 'c'] }]);
    expect(expandToLeaves(['g1'], adapter)).toEqual(['a', 'b', 'c']);
  });

  it('flattens nested groups', () => {
    const adapter = makeAdapter([
      { id: 'g1', members: ['a', 'b'] },
      { id: 'g2', members: ['g1', 'c'] },
    ]);
    expect(expandToLeaves(['g2'], adapter)).toEqual(['a', 'b', 'c']);
  });

  it('skips groups themselves; returns only leaves', () => {
    const adapter = makeAdapter([
      { id: 'g1', members: ['a'] },
      { id: 'g2', members: ['g1', 'b'] },
    ]);
    const out = expandToLeaves(['g2', 'c'], adapter);
    expect(out).toEqual(['a', 'b', 'c']);
    expect(out).not.toContain('g1');
    expect(out).not.toContain('g2');
  });

  it('preserves leaf ids that are not groups', () => {
    const adapter = makeAdapter([]);
    expect(expandToLeaves(['a', 'b'], adapter)).toEqual(['a', 'b']);
  });

  it('terminates on a membership cycle without infinite-looping', () => {
    const adapter = makeAdapter([
      { id: 'g1', members: ['a', 'g2'] },
      { id: 'g2', members: ['b', 'g1'] },
    ]);
    const out = expandToLeaves(['g1'], adapter);
    expect(out.sort()).toEqual(['a', 'b']);
  });
});
