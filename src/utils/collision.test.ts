import { describe, expect, it } from 'vitest';
import type { Structure } from '../model/types';
import { createStructure } from '../model/types';
import { structuresCollide } from './collision';

function makeStructure(overrides: Partial<Structure> & { type: string; x: number; y: number; width: number; height: number }): Structure {
  return { ...createStructure(overrides), ...overrides };
}

describe('structuresCollide', () => {
  it('returns true when structures overlap', () => {
    const a = makeStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const b = makeStructure({ type: 'raised-bed', x: 2, y: 2, width: 4, height: 4 });
    expect(structuresCollide(a, [b])).toBe(true);
  });

  it('returns false when structures are adjacent', () => {
    const a = makeStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const b = makeStructure({ type: 'raised-bed', x: 4, y: 0, width: 4, height: 4 });
    expect(structuresCollide(a, [b])).toBe(false);
  });

  it('returns false when structures are far apart', () => {
    const a = makeStructure({ type: 'raised-bed', x: 0, y: 0, width: 2, height: 2 });
    const b = makeStructure({ type: 'raised-bed', x: 10, y: 10, width: 2, height: 2 });
    expect(structuresCollide(a, [b])).toBe(false);
  });

  it('returns false when no other structures exist', () => {
    const a = makeStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    expect(structuresCollide(a, [])).toBe(false);
  });

  it('allows placing on a surface structure', () => {
    const pot = makeStructure({ type: 'pot', x: 1, y: 1, width: 1, height: 1 });
    const patio = makeStructure({ type: 'patio', x: 0, y: 0, width: 5, height: 5 });
    expect(structuresCollide(pot, [patio])).toBe(false);
  });

  it('allows a surface to overlap with another structure', () => {
    const patio = makeStructure({ type: 'patio', x: 0, y: 0, width: 5, height: 5 });
    const bed = makeStructure({ type: 'raised-bed', x: 2, y: 2, width: 4, height: 4 });
    expect(structuresCollide(patio, [bed])).toBe(false);
  });

  it('allows two surfaces to overlap', () => {
    const patio = makeStructure({ type: 'patio', x: 0, y: 0, width: 5, height: 5 });
    const path = makeStructure({ type: 'path', x: 2, y: 2, width: 2, height: 6 });
    expect(structuresCollide(patio, [path])).toBe(false);
  });

  it('detects collision with any one of multiple structures', () => {
    const a = makeStructure({ type: 'raised-bed', x: 5, y: 5, width: 4, height: 4 });
    const others = [
      makeStructure({ type: 'raised-bed', x: 0, y: 0, width: 2, height: 2 }),
      makeStructure({ type: 'raised-bed', x: 6, y: 6, width: 2, height: 2 }),
    ];
    expect(structuresCollide(a, others)).toBe(true);
  });

  it('returns false when not overlapping any of multiple structures', () => {
    const a = makeStructure({ type: 'raised-bed', x: 5, y: 5, width: 1, height: 1 });
    const others = [
      makeStructure({ type: 'raised-bed', x: 0, y: 0, width: 2, height: 2 }),
      makeStructure({ type: 'raised-bed', x: 10, y: 10, width: 2, height: 2 }),
    ];
    expect(structuresCollide(a, others)).toBe(false);
  });
});
