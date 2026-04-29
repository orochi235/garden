import { describe, expect, it } from 'vitest';
import { TRAY_CATALOG, getTrayPreset, instantiatePreset } from './trayCatalog';

describe('trayCatalog', () => {
  it('catalog includes 1020-36 and 1020-72', () => {
    const ids = TRAY_CATALOG.map((p) => p.id);
    expect(ids).toContain('1020-36');
    expect(ids).toContain('1020-72');
  });

  it('getTrayPreset returns by id', () => {
    expect(getTrayPreset('1020-36')?.rows).toBe(6);
    expect(getTrayPreset('nonexistent')).toBeUndefined();
  });

  it('instantiatePreset produces a tray with the right shape', () => {
    const tray = instantiatePreset('1020-36');
    expect(tray).toBeDefined();
    expect(tray!.rows * tray!.cols).toBe(36);
    expect(tray!.slots).toHaveLength(36);
  });
});
