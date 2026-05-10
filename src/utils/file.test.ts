import { describe, expect, it } from 'vitest';
import { emptySeedStartingState } from '../model/seedStarting';
import { createGarden } from '../model/types';
import { getCultivar } from '../model/cultivars';
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
  it('strips builtin cultivars from collection on serialize, re-hydrates on deserialize', () => {
    const garden = createGarden({ name: 'T', widthFt: 10, lengthFt: 10 });
    const cabbage = getCultivar('cabbage.red');
    const tomato = getCultivar('tomato.brandywine');
    if (!cabbage || !tomato) throw new Error('test fixtures missing in cultivars database');
    garden.collection = [cabbage, tomato];

    const json = serializeGarden(garden);
    // Disk shape: builtin entries are id-only refs (no iconImage bloat).
    const onDisk = JSON.parse(json);
    expect(onDisk.collection).toEqual([{ id: 'cabbage.red' }, { id: 'tomato.brandywine' }]);
    expect(json).not.toContain('data:image');

    // Round-trip: collection comes back as full Cultivar[].
    const restored = deserializeGarden(json);
    expect(restored.collection.map((c) => c.id)).toEqual(['cabbage.red', 'tomato.brandywine']);
    expect(restored.collection[0].iconBgColor).toBe(cabbage.iconBgColor);
  });

  it('preserves custom (non-builtin) cultivars inline on disk', () => {
    const garden = createGarden({ name: 'T', widthFt: 10, lengthFt: 10 });
    const custom = {
      id: 'tomato.my-special',
      speciesId: 'tomato',
      name: 'Tomato, My Special',
      category: 'fruits' as const,
      taxonomicName: 'Solanum lycopersicum',
      variety: 'My Special',
      color: '#abcdef',
      footprintFt: 1, spacingFt: 2, heightFt: 6,
      heightFtOverride: undefined,
      climber: false,
      iconImage: null, iconBgColor: null,
      seedStarting: { startable: false, cellSize: 'medium' as const, daysToGerminate: null, weeksToTransplant: null, weeksBeforeLastFrost: null, sowDepthIn: null, lightOnGermination: null, bottomHeat: null, notes: null },
    };
    garden.collection = [custom];
    const json = serializeGarden(garden);
    const onDisk = JSON.parse(json);
    expect(onDisk.collection[0].color).toBe('#abcdef');
    const restored = deserializeGarden(json);
    expect(restored.collection[0].id).toBe('tomato.my-special');
    expect(restored.collection[0].color).toBe('#abcdef');
  });

  it('accepts legacy files where collection holds full Cultivar objects (id matches builtin)', () => {
    const garden = createGarden({ name: 'T', widthFt: 10, lengthFt: 10 });
    const cabbage = getCultivar('cabbage.red')!;
    const legacy = JSON.parse(serializeGarden(garden));
    legacy.collection = [cabbage];  // pre-projection shape
    const restored = deserializeGarden(JSON.stringify(legacy));
    expect(restored.collection.map((c) => c.id)).toEqual(['cabbage.red']);
    expect(restored.collection[0].iconBgColor).toBe(cabbage.iconBgColor);
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
