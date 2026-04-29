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
});
