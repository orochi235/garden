import { describe, it, expect } from 'vitest';
import {
  STRUCTURE_LAYER_DESCRIPTORS,
  createStructureLayers,
} from './structureLayersWorld';
import {
  ZONE_LAYER_DESCRIPTORS,
  createZoneLayers,
} from './zoneLayersWorld';
import {
  PLANTING_LAYER_DESCRIPTORS,
  createPlantingLayers,
} from './plantingLayersWorld';
import {
  SELECTION_LAYER_DESCRIPTORS,
  createSelectionOutlineLayer,
  createGroupOutlineLayer,
  createSelectionHandlesLayer,
} from './selectionLayersWorld';
import type { GetUi, LayerDescriptor } from './worldLayerData';

const ui: ReturnType<GetUi> = {
  selectedIds: [],
  labelMode: 'none',
  labelFontSize: 13,
  plantIconScale: 1,
  showFootprintCircles: true,
  highlightOpacity: 0,
  debugOverlappingLabels: false,
};

/**
 * Each `*LayersWorld.ts` factory must emit exactly the layers listed in its
 * descriptor array (same ids, same order, identical metadata). The
 * descriptor arrays are imported by `RenderLayersPanel`; if the factory
 * drifts, the panel silently drops a layer or shows a stale label. This
 * suite catches the drift at build time.
 */
function assertMatches(
  descriptors: readonly LayerDescriptor[],
  layers: { id: string; label: string; alwaysOn?: boolean; defaultVisible?: boolean }[],
): void {
  expect(layers.map((l) => l.id)).toEqual(descriptors.map((d) => d.id));
  for (const d of descriptors) {
    const layer = layers.find((l) => l.id === d.id);
    expect(layer, `factory missing layer for descriptor ${d.id}`).toBeDefined();
    expect(layer!.label).toBe(d.label);
    expect(Boolean(layer!.alwaysOn)).toBe(Boolean(d.alwaysOn));
    expect(layer!.defaultVisible).toBe(d.defaultVisible);
  }
}

describe('layer descriptor / factory invariants', () => {
  it('structure factory matches STRUCTURE_LAYER_DESCRIPTORS exactly', () => {
    const layers = createStructureLayers(() => [], () => ui);
    assertMatches(STRUCTURE_LAYER_DESCRIPTORS, layers);
  });

  it('zone factory matches ZONE_LAYER_DESCRIPTORS exactly', () => {
    const layers = createZoneLayers(() => [], () => ui);
    assertMatches(ZONE_LAYER_DESCRIPTORS, layers);
  });

  it('planting factory matches PLANTING_LAYER_DESCRIPTORS exactly', () => {
    const layers = createPlantingLayers(() => [], () => [], () => [], () => ui);
    assertMatches(PLANTING_LAYER_DESCRIPTORS, layers);
  });

  it('selection factories match SELECTION_LAYER_DESCRIPTORS exactly', () => {
    // Selection layers are produced by three separate factories; together
    // they must cover the descriptor set exactly with no orphans either way.
    const layers = [
      createGroupOutlineLayer(() => [], () => ui),
      createSelectionOutlineLayer(() => [], () => [], () => [], () => ui),
      createSelectionHandlesLayer(() => [], () => [], () => ui),
    ];
    assertMatches(SELECTION_LAYER_DESCRIPTORS, layers);
  });
});
