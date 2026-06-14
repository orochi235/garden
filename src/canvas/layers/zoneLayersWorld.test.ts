import { describe, expect, it } from 'vitest';
import type { GetUi } from './worldLayerData';
import { createZoneLayers } from './zoneLayersWorld';

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
    const layers = createZoneLayers(
      () => [],
      () => baseUi,
    );
    expect(layers.map((l) => l.id)).toEqual([
      'zone-bodies',
      'zone-patterns',
      'zone-highlights',
      'zone-labels',
    ]);
  });
});
