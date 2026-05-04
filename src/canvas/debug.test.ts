import { describe, it, expect } from 'vitest';
import { parseDebugTokens } from './debug';

describe('parseDebugTokens', () => {
  it('returns empty set for null/empty input', () => {
    expect(parseDebugTokens(null).size).toBe(0);
    expect(parseDebugTokens(undefined).size).toBe(0);
    expect(parseDebugTokens('').size).toBe(0);
  });

  it('parses a single token', () => {
    expect([...parseDebugTokens('hitboxes')]).toEqual(['hitboxes']);
  });

  it('parses comma-separated tokens', () => {
    const set = parseDebugTokens('hitboxes,bounds,axes');
    expect(set.has('hitboxes')).toBe(true);
    expect(set.has('bounds')).toBe(true);
    expect(set.has('axes')).toBe(true);
    expect(set.size).toBe(3);
  });

  it('trims whitespace and skips empties', () => {
    const set = parseDebugTokens(' hitboxes , , bounds  ');
    expect([...set].sort()).toEqual(['bounds', 'hitboxes']);
  });
});
