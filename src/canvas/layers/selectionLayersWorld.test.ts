import { describe, it, expect } from 'vitest';
import {
  createSelectionHandlesLayer,
  createAllHandlesLayer,
} from './selectionLayersWorld';
import type { GetUi } from './worldLayerData';

function ui(over: Partial<ReturnType<GetUi>> = {}): ReturnType<GetUi> {
  return {
    selectedIds: [],
    labelMode: 'none',
    labelFontSize: 13,
    plantIconScale: 1,
    showFootprintCircles: true,
    getHighlight: () => 0,
    debugOverlappingLabels: false,
    dragClashIds: [],
    ...over,
  };
}

describe('createSelectionHandlesLayer', () => {
  it('declares space=screen so handles stay sharp at any zoom', () => {
    const layer = createSelectionHandlesLayer(() => [], () => [], () => ui());
    expect(layer.space).toBe('screen');
  });
});

describe('createAllHandlesLayer (?debug=handles)', () => {
  it('declares space=screen so handles stay sharp at any zoom', () => {
    const layer = createAllHandlesLayer({});
    expect(layer.space).toBe('screen');
  });
});
