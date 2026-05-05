import { describe, expect, it } from 'vitest';
import { emptySeedStartingState } from '../model/seedStarting';
import { createGarden } from '../model/types';
import { deserializeGarden, serializeGarden } from './file';

describe('serializeGarden', () => {
  it('serializes to JSON string', () => {
    const garden = createGarden({ name: 'Test', widthFt: 20, lengthFt: 15 });
    const json = serializeGarden(garden);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('Test');
    expect(parsed.version).toBe(1);
  });
});

describe('deserializeGarden', () => {
  it('deserializes valid JSON', () => {
    const garden = createGarden({ name: 'Test', widthFt: 20, lengthFt: 15 });
    const json = serializeGarden(garden);
    const result = deserializeGarden(json);
    expect(result.name).toBe('Test');
    expect(result.widthFt).toBe(20);
  });
  it('throws on invalid JSON', () => {
    expect(() => deserializeGarden('not json')).toThrow();
  });
  it('throws on missing required fields', () => {
    expect(() => deserializeGarden(JSON.stringify({ name: 'test' }))).toThrow();
  });
  it('backfills seedStarting when missing from legacy save', () => {
    const garden = createGarden({ name: 'Legacy', widthFt: 20, lengthFt: 15 });
    const json = serializeGarden(garden);
    const parsed = JSON.parse(json);
    delete parsed.seedStarting;
    const result = deserializeGarden(JSON.stringify(parsed));
    expect(result.seedStarting).toEqual(emptySeedStartingState());
  });
  it('migrates legacy heightFt → lengthFt on garden, structures, and zones', () => {
    const legacy = {
      version: 1,
      name: 'Legacy',
      widthFt: 20,
      heightFt: 15,
      gridCellSizeFt: 1,
      displayUnit: 'ft',
      groundColor: '#000',
      blueprint: null,
      structures: [{ id: 's1', x: 0, y: 0, width: 4, height: 8, type: 'raised-bed' }],
      zones: [{ id: 'z1', x: 0, y: 0, width: 4, height: 4 }],
      plantings: [],
      collection: [],
    };
    const result = deserializeGarden(JSON.stringify(legacy));
    expect(result.lengthFt).toBe(15);
    expect((result as unknown as { heightFt?: number }).heightFt).toBeUndefined();
    expect(result.structures[0].length).toBe(8);
    expect((result.structures[0] as unknown as { height?: number }).height).toBeUndefined();
    expect(result.zones[0].length).toBe(4);
    expect((result.zones[0] as unknown as { height?: number }).height).toBeUndefined();
  });
});
