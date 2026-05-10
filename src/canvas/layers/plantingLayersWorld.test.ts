import { describe, it, expect } from 'vitest';
import { createPlantingLayers } from './plantingLayersWorld';
import type { GetUi } from './worldLayerData';

const view = { x: 0, y: 0, scale: 10 };
const dims = { width: 100, height: 100 };
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

describe('createPlantingLayers (world)', () => {
  it('returns 7 layers in canonical order', () => {
    const layers = createPlantingLayers(() => [], () => [], () => [], () => baseUi);
    expect(layers.map((l) => l.id)).toEqual([
      'container-overlays',
      'planting-spacing',
      'planting-icons',
      'planting-measurements',
      'planting-highlights',
      'planting-labels',
      'container-walls',
    ]);
  });

  it('planting-icons is alwaysOn', () => {
    const layers = createPlantingLayers(() => [], () => [], () => [], () => baseUi);
    expect(layers.find((l) => l.id === 'planting-icons')?.alwaysOn).toBe(true);
  });

  it('planting-measurements has defaultVisible=false', () => {
    const layers = createPlantingLayers(() => [], () => [], () => [], () => baseUi);
    expect(layers.find((l) => l.id === 'planting-measurements')?.defaultVisible).toBe(false);
  });

  it('renders no-op cleanly with empty inputs', () => {
    const layers = createPlantingLayers(() => [], () => [], () => [], () => baseUi);
    for (const layer of layers) {
      expect(() => layer.draw({}, view, dims)).not.toThrow();
    }
  });
});
