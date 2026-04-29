import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED_STARTING_FIELDS,
  resolveSeedStarting,
} from './floraSeedStarting';

describe('resolveSeedStarting', () => {
  it('returns defaults when neither side has fields', () => {
    expect(resolveSeedStarting(undefined, undefined)).toEqual(DEFAULT_SEED_STARTING_FIELDS);
  });

  it('species overrides defaults', () => {
    const r = resolveSeedStarting({ startable: true }, undefined);
    expect(r.startable).toBe(true);
    expect(r.cellSize).toBe('medium');
  });

  it('cultivar overrides species', () => {
    const r = resolveSeedStarting(
      { startable: true, cellSize: 'small' },
      { cellSize: 'large' },
    );
    expect(r.startable).toBe(true);
    expect(r.cellSize).toBe('large');
  });

  it('weeksBeforeLastFrost defaults to null and propagates from species/cultivar', () => {
    expect(resolveSeedStarting(undefined, undefined).weeksBeforeLastFrost).toBeNull();
    const fromSpecies = resolveSeedStarting({ weeksBeforeLastFrost: [8, 4] }, undefined);
    expect(fromSpecies.weeksBeforeLastFrost).toEqual([8, 4]);
    const fromCultivar = resolveSeedStarting({ weeksBeforeLastFrost: [8, 4] }, { weeksBeforeLastFrost: [6, 2] });
    expect(fromCultivar.weeksBeforeLastFrost).toEqual([6, 2]);
  });
});
