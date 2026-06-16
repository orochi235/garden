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
  it('returns only the label layer (bodies/patterns/highlights moved to the scene slot)', () => {
    const layers = createZoneLayers(
      () => [],
      () => baseUi,
    );
    expect(layers.map((l) => l.id)).toEqual(['zone-labels']);
  });
});
