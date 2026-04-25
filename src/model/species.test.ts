import { describe, expect, it } from 'vitest';
import { getAllSpecies, getSpecies } from './species';

describe('species registry', () => {
  it('getAllSpecies returns entries', () => {
    const all = getAllSpecies();
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(all[0]).toHaveProperty('id');
    expect(all[0]).toHaveProperty('name');
    expect(all[0]).toHaveProperty('category');
  });

  it('getSpecies returns a known species', () => {
    const tomato = getSpecies('tomato');
    expect(tomato).toBeDefined();
    expect(tomato!.name).toBe('Tomato');
  });

  it('getSpecies returns undefined for unknown id', () => {
    expect(getSpecies('nonexistent')).toBeUndefined();
  });

  it('every species has a unique id', () => {
    const ids = getAllSpecies().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
