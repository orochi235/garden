import { describe, expect, it } from 'vitest';
import type { CultivarCategory } from './cultivars';
import { getCultivar, getAllCultivars } from './cultivars';

const VALID_CATEGORIES: CultivarCategory[] = [
  'herbs', 'vegetables', 'fruits', 'flowers', 'root-vegetables', 'legumes',
];

describe('cultivar registry', () => {
  it('getAllCultivars returns all entries', () => {
    const all = getAllCultivars();
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(all[0]).toHaveProperty('id');
    expect(all[0]).toHaveProperty('name');
    expect(all[0]).toHaveProperty('taxonomicName');
    expect(all[0]).toHaveProperty('color');
    expect(all[0]).toHaveProperty('footprintFt');
    expect(all[0]).toHaveProperty('spacingFt');
  });

  it('getCultivar returns a known cultivar by id', () => {
    const tomato = getCultivar('tomato');
    expect(tomato).toBeDefined();
    expect(tomato!.name).toBe('Tomato');
    expect(tomato!.taxonomicName).toBe('Solanum lycopersicum');
  });

  it('getCultivar returns undefined for unknown id', () => {
    expect(getCultivar('nonexistent')).toBeUndefined();
  });

  it('every cultivar has a valid category', () => {
    for (const c of getAllCultivars()) {
      expect(VALID_CATEGORIES).toContain(c.category);
    }
  });

  it('every cultivar has positive spacingFt and footprintFt', () => {
    for (const c of getAllCultivars()) {
      expect(c.spacingFt).toBeGreaterThan(0);
      expect(c.footprintFt).toBeGreaterThan(0);
    }
  });

  it('every cultivar has a unique id', () => {
    const ids = getAllCultivars().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains cultivars across multiple categories', () => {
    const categories = new Set(getAllCultivars().map((c) => c.category));
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });
});
