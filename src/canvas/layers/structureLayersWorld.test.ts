import { describe, it, expect } from 'vitest';
import { createStructureLayers } from './structureLayersWorld';
import type { Structure } from '../../model/types';
import type { GetUi } from './worldLayerData';

function makeStructure(over: Partial<Structure> = {}): Structure {
  return {
    id: 's1',
    x: 0, y: 0, width: 4, length: 4,
    color: '#888',
    zIndex: 0,
    label: '',
    type: 'path',
    shape: 'rectangle',
    surface: null,
    fill: null,
    wallThicknessFt: 0.5,
    groupId: null,
    ...over,
  } as unknown as Structure;
}

const view = { x: 0, y: 0, scale: 10 };

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

describe('createStructureLayers (world)', () => {
  it('returns 6 layers in canonical order', () => {
    const layers = createStructureLayers(() => [], () => baseUi);
    expect(layers.map((l) => l.id)).toEqual([
      'structure-walls',
      'structure-bodies',
      'structure-surfaces',
      'structure-plantable-area',
      'structure-highlights',
      'structure-labels',
    ]);
  });

  it('structure-highlights returns empty array when no structure has getHighlight(id)>0', () => {
    const s = makeStructure();
    const ui: ReturnType<GetUi> = { ...baseUi, getHighlight: () => 0 };
    const layer = createStructureLayers(() => [s], () => ui)
      .find((l) => l.id === 'structure-highlights')!;
    const result = layer.draw({}, view, { width: 800, height: 600 });
    expect(result).toEqual([]);
  });

  it('structure-labels returns empty array when labelMode is none', () => {
    const s = makeStructure({ label: 'X' });
    const layer = createStructureLayers(() => [s], () => baseUi)
      .find((l) => l.id === 'structure-labels')!;
    const result = layer.draw({}, view, { width: 800, height: 600 });
    expect(result).toEqual([]);
  });
});
