import { describe, it, expect } from 'vitest';
import { normalizeShadingTerm, normalizeCompanionTerm } from './weights';

describe('normalizeShadingTerm', () => {
  it('returns a value in [0, 1] given any height pair', () => {
    expect(normalizeShadingTerm(0, 0)).toBe(0);
    expect(normalizeShadingTerm(36, 12)).toBeGreaterThan(0);
    expect(normalizeShadingTerm(36, 12)).toBeLessThanOrEqual(1);
    expect(normalizeShadingTerm(120, 1)).toBeLessThanOrEqual(1);
  });

  it('is monotonic in absolute height difference', () => {
    expect(normalizeShadingTerm(36, 12)).toBeGreaterThan(normalizeShadingTerm(24, 18));
  });
});

describe('normalizeCompanionTerm', () => {
  it('returns 1 for adjacent pair, 0 for far pair', () => {
    expect(normalizeCompanionTerm(0, 12)).toBe(1);
    expect(normalizeCompanionTerm(48, 12)).toBe(0);
  });
});
