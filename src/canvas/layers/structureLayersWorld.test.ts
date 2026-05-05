import { describe, it, expect, vi } from 'vitest';
import { createStructureLayers } from './structureLayersWorld';
import type { Structure } from '../../model/types';
import type { GetUi } from './worldLayerData';

function makeStructure(over: Partial<Structure> = {}): Structure {
  return {
    id: 's1',
    x: 0, y: 0, width: 4, height: 4,
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

function makeCtx(): CanvasRenderingContext2D {
  return {
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    ellipse: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
  } as unknown as CanvasRenderingContext2D;
}

const view = { x: 0, y: 0, scale: 10 };

const baseUi: ReturnType<GetUi> = {
  selectedIds: [],
  labelMode: 'none',
  labelFontSize: 13,
  plantIconScale: 1,
  showFootprintCircles: true,
  highlightOpacity: 0,
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

  it('structure-bodies draws fillRect at world coords (no scale baked in)', () => {
    const ctx = makeCtx();
    const s = makeStructure({ x: 3, y: 4, width: 2, height: 2 });
    const layer = createStructureLayers(() => [s], () => baseUi).find((l) => l.id === 'structure-bodies')!;
    layer.draw(ctx, {}, view);
    // fillRect should be called with raw world coords; transform is applied
    // by runLayers wrapper, not by the layer.
    expect(ctx.fillRect).toHaveBeenCalledWith(3, 4, 2, 2);
  });

  it('structure-bodies sets stroke width inversely scaled (1px screen → 1/scale world)', () => {
    const ctx = makeCtx();
    const s = makeStructure({ x: 0, y: 0, width: 1, height: 1 });
    const layer = createStructureLayers(() => [s], () => baseUi).find((l) => l.id === 'structure-bodies')!;
    layer.draw(ctx, {}, { x: 0, y: 0, scale: 10 });
    expect(ctx.lineWidth).toBeCloseTo(0.1);
  });

  it('structure-highlights skips when highlightOpacity=0', () => {
    const ctx = makeCtx();
    const s = makeStructure();
    const ui: ReturnType<GetUi> = { ...baseUi, highlightOpacity: 0 };
    const layer = createStructureLayers(() => [s], () => ui)
      .find((l) => l.id === 'structure-highlights')!;
    layer.draw(ctx, {}, view);
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('structure-highlights draws when highlightOpacity > 0', () => {
    const ctx = makeCtx();
    const s = makeStructure();
    const ui: ReturnType<GetUi> = { ...baseUi, highlightOpacity: 0.5 };
    const layer = createStructureLayers(() => [s], () => ui)
      .find((l) => l.id === 'structure-highlights')!;
    layer.draw(ctx, {}, view);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
  });

  it('structure-labels skips when labelMode is none', () => {
    const ctx = makeCtx();
    const s = makeStructure({ label: 'X' });
    const layer = createStructureLayers(() => [s], () => baseUi)
      .find((l) => l.id === 'structure-labels')!;
    layer.draw(ctx, {}, view);
    expect(ctx.save).not.toHaveBeenCalled();
  });
});
