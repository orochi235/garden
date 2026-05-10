import { describe, it, expect } from 'vitest';
import { createZoneLayers } from './zoneLayersWorld';
import type { GetUi } from './worldLayerData';

const baseUi: ReturnType<GetUi> = {
  selectedIds: [],
  labelMode: 'none',
  labelFontSize: 13,
  plantIconScale: 1,
  showFootprintCircles: true,
  getHighlight: () => 0,
  debugOverlappingLabels: false,
  dragClashIds: [],
};

describe('createZoneLayers (world)', () => {
  it('returns 4 layers in canonical order', () => {
    const layers = createZoneLayers(() => [], () => baseUi);
    expect(layers.map((l) => l.id)).toEqual(['zone-bodies', 'zone-patterns', 'zone-highlights', 'zone-labels']);
  });
});
