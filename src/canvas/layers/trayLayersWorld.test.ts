import { describe, expect, it } from 'vitest';
import { createTrayLayers } from './trayLayersWorld';

describe('createTrayLayers (world)', () => {
  it('returns 4 layers in canonical order', () => {
    const layers = createTrayLayers(() => []);
    expect(layers.map((l) => l.id)).toEqual(['tray-body', 'tray-wells', 'tray-grid', 'tray-labels']);
  });
});
