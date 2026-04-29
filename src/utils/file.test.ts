import { describe, expect, it } from 'vitest';
import { emptySeedStartingState } from '../model/seedStarting';
import { createGarden } from '../model/types';
import { deserializeGarden, serializeGarden } from './file';

describe('serializeGarden', () => {
  it('serializes to JSON string', () => {
    const garden = createGarden({ name: 'Test', widthFt: 20, heightFt: 15 });
    const json = serializeGarden(garden);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('Test');
    expect(parsed.version).toBe(1);
  });
});

describe('deserializeGarden', () => {
  it('deserializes valid JSON', () => {
    const garden = createGarden({ name: 'Test', widthFt: 20, heightFt: 15 });
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
    const garden = createGarden({ name: 'Legacy', widthFt: 20, heightFt: 15 });
    const json = serializeGarden(garden);
    const parsed = JSON.parse(json);
    delete parsed.seedStarting;
    const result = deserializeGarden(JSON.stringify(parsed));
    expect(result.seedStarting).toEqual(emptySeedStartingState());
  });
});
