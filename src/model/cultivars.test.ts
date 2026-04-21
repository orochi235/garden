import { describe, expect, it } from 'vitest';
import { getCultivar, getAllCultivars } from './cultivars';

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
});
