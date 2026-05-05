import { describe, expect, it } from 'vitest';
import type { Structure } from '../model/types';
import { createStructure } from '../model/types';
import { expandToGroups } from './groups';

function makeStructure(overrides: Partial<Structure> & { type: string; x: number; y: number; width: number; length: number }): Structure {
  const { groupId, ...createOpts } = overrides;
  return { ...createStructure({ ...createOpts, groupId: groupId ?? undefined }), ...overrides, groupId: groupId === undefined ? null : groupId };
}

describe('expandToGroups', () => {
  it('passes through ungrouped ids unchanged', () => {
    const a = makeStructure({ type: 'bed', x: 0, y: 0, width: 1, length: 1, groupId: null });
    const b = makeStructure({ type: 'bed', x: 2, y: 0, width: 1, length: 1, groupId: null });
    expect(expandToGroups([a.id], [a, b])).toEqual([a.id]);
  });

  it('expands a single grouped member to all siblings', () => {
    const a = makeStructure({ type: 'bed', x: 0, y: 0, width: 1, length: 1, groupId: 'g1' });
    const b = makeStructure({ type: 'bed', x: 2, y: 0, width: 1, length: 1, groupId: 'g1' });
    const c = makeStructure({ type: 'bed', x: 4, y: 0, width: 1, length: 1, groupId: 'g1' });
    const out = expandToGroups([a.id], [a, b, c]);
    expect(out.sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it('handles multiple groups', () => {
    const a = makeStructure({ type: 'bed', x: 0, y: 0, width: 1, length: 1, groupId: 'g1' });
    const b = makeStructure({ type: 'bed', x: 2, y: 0, width: 1, length: 1, groupId: 'g1' });
    const c = makeStructure({ type: 'bed', x: 4, y: 0, width: 1, length: 1, groupId: 'g2' });
    const d = makeStructure({ type: 'bed', x: 6, y: 0, width: 1, length: 1, groupId: 'g2' });
    const e = makeStructure({ type: 'bed', x: 8, y: 0, width: 1, length: 1, groupId: null });
    const out = expandToGroups([a.id, c.id], [a, b, c, d, e]);
    expect(out.sort()).toEqual([a.id, b.id, c.id, d.id].sort());
    expect(out).not.toContain(e.id);
  });

  it('does not duplicate ids when input already includes siblings', () => {
    const a = makeStructure({ type: 'bed', x: 0, y: 0, width: 1, length: 1, groupId: 'g1' });
    const b = makeStructure({ type: 'bed', x: 2, y: 0, width: 1, length: 1, groupId: 'g1' });
    const out = expandToGroups([a.id, b.id], [a, b]);
    expect(out).toHaveLength(2);
    expect(out.sort()).toEqual([a.id, b.id].sort());
  });

  it('is idempotent', () => {
    const a = makeStructure({ type: 'bed', x: 0, y: 0, width: 1, length: 1, groupId: 'g1' });
    const b = makeStructure({ type: 'bed', x: 2, y: 0, width: 1, length: 1, groupId: 'g1' });
    const c = makeStructure({ type: 'bed', x: 4, y: 0, width: 1, length: 1, groupId: null });
    const once = expandToGroups([a.id], [a, b, c]);
    const twice = expandToGroups(once, [a, b, c]);
    expect(twice).toEqual(once);
  });

  it('passes through ids not present in structures', () => {
    const a = makeStructure({ type: 'bed', x: 0, y: 0, width: 1, length: 1, groupId: null });
    const out = expandToGroups(['ghost-id'], [a]);
    expect(out).toEqual(['ghost-id']);
  });

  it('mixes grouped and ungrouped input', () => {
    const a = makeStructure({ type: 'bed', x: 0, y: 0, width: 1, length: 1, groupId: 'g1' });
    const b = makeStructure({ type: 'bed', x: 2, y: 0, width: 1, length: 1, groupId: 'g1' });
    const c = makeStructure({ type: 'bed', x: 4, y: 0, width: 1, length: 1, groupId: null });
    const out = expandToGroups([a.id, c.id], [a, b, c]);
    expect(out.sort()).toEqual([a.id, b.id, c.id].sort());
  });
});
