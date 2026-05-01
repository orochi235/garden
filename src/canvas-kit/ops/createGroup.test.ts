import { describe, expect, it } from 'vitest';
import type { Group, GroupAdapter } from '../groups/types';
import { createCreateGroupOp } from './createGroup';
import { createDissolveGroupOp } from './dissolveGroup';
import { createAddToGroupOp } from './addToGroup';
import { createRemoveFromGroupOp } from './removeFromGroup';

function makeAdapter(): GroupAdapter & {
  groups: Map<string, Group>;
  log: string[];
} {
  const groups = new Map<string, Group>();
  const log: string[] = [];
  return {
    groups,
    log,
    getGroup: (id) => groups.get(id),
    getGroupsForMember: (id) =>
      [...groups.values()].filter((g) => g.members.includes(id)).map((g) => g.id),
    insertGroup: (g) => {
      log.push(`insert:${g.id}`);
      groups.set(g.id, { ...g, members: [...g.members] });
    },
    removeGroup: (id) => {
      log.push(`remove:${id}`);
      groups.delete(id);
    },
    addToGroup: (gid, ids) => {
      log.push(`add:${gid}:${ids.join(',')}`);
      const g = groups.get(gid);
      if (g) g.members.push(...ids);
    },
    removeFromGroup: (gid, ids) => {
      log.push(`rm:${gid}:${ids.join(',')}`);
      const g = groups.get(gid);
      if (g) g.members = g.members.filter((m) => !ids.includes(m));
    },
  };
}

describe('createCreateGroupOp / createDissolveGroupOp', () => {
  it('createGroup apply inserts the group', () => {
    const adapter = makeAdapter();
    const group: Group = { id: 'g1', members: ['a', 'b'] };
    createCreateGroupOp({ group }).apply(adapter);
    expect(adapter.groups.get('g1')?.members).toEqual(['a', 'b']);
  });

  it('createGroup invert removes the group', () => {
    const adapter = makeAdapter();
    const group: Group = { id: 'g1', members: ['a', 'b'] };
    const op = createCreateGroupOp({ group });
    op.apply(adapter);
    op.invert().apply(adapter);
    expect(adapter.groups.has('g1')).toBe(false);
  });

  it('dissolveGroup apply removes; invert restores full snapshot', () => {
    const adapter = makeAdapter();
    const group: Group = { id: 'g1', members: ['a', 'b', 'c'] };
    adapter.insertGroup(group);
    const op = createDissolveGroupOp({ group });
    op.apply(adapter);
    expect(adapter.groups.has('g1')).toBe(false);
    op.invert().apply(adapter);
    expect(adapter.groups.get('g1')?.members).toEqual(['a', 'b', 'c']);
  });

  it('round-trip: createGroup apply then invert returns to empty', () => {
    const adapter = makeAdapter();
    const group: Group = { id: 'g1', members: ['x'] };
    const op = createCreateGroupOp({ group });
    op.apply(adapter);
    op.invert().apply(adapter);
    expect(adapter.groups.size).toBe(0);
  });
});

describe('createAddToGroupOp / createRemoveFromGroupOp', () => {
  it('addToGroup apply appends; invert removes', () => {
    const adapter = makeAdapter();
    adapter.insertGroup({ id: 'g1', members: ['a'] });
    const op = createAddToGroupOp({ groupId: 'g1', ids: ['b', 'c'] });
    op.apply(adapter);
    expect(adapter.groups.get('g1')?.members).toEqual(['a', 'b', 'c']);
    op.invert().apply(adapter);
    expect(adapter.groups.get('g1')?.members).toEqual(['a']);
  });

  it('removeFromGroup apply removes; invert restores', () => {
    const adapter = makeAdapter();
    adapter.insertGroup({ id: 'g1', members: ['a', 'b', 'c'] });
    const op = createRemoveFromGroupOp({ groupId: 'g1', ids: ['b'] });
    op.apply(adapter);
    expect(adapter.groups.get('g1')?.members).toEqual(['a', 'c']);
    op.invert().apply(adapter);
    expect(adapter.groups.get('g1')?.members).toEqual(['a', 'c', 'b']);
  });

  it('addToGroup round-trip leaves members unchanged', () => {
    const adapter = makeAdapter();
    adapter.insertGroup({ id: 'g1', members: ['a'] });
    const op = createAddToGroupOp({ groupId: 'g1', ids: ['b'] });
    op.apply(adapter);
    op.invert().apply(adapter);
    expect(adapter.groups.get('g1')?.members).toEqual(['a']);
  });
});
