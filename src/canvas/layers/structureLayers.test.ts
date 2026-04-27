import { describe, it, expect, vi } from 'vitest';
import { STRUCTURE_LAYERS, buildStructureRenderQueue } from './structureLayers';
import type { StructureLayerData } from '../layerData';
import type { Structure } from '../../model/types';

function makeStructure(overrides: Partial<Structure> = {}): Structure {
  return {
    id: 's1',
    x: 0,
    y: 0,
    width: 4,
    height: 4,
    color: '#888888',
    zIndex: 0,
    label: '',
    type: 'path',
    shape: 'rectangle',
    surface: null,
    fill: null,
    wallThicknessFt: 0.5,
    groupId: null,
    ...overrides,
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

const baseView = { panX: 0, panY: 0, zoom: 1 };

function makeData(overrides: Partial<StructureLayerData> = {}): StructureLayerData {
  const structures = overrides.structures ?? [makeStructure()];
  const { renderQueue, groups } = buildStructureRenderQueue(structures);
  return {
    view: baseView,
    canvasWidth: 800,
    canvasHeight: 600,
    labelMode: 'none',
    labelFontSize: 13,
    highlightOpacity: 0,
    structures,
    groups,
    ungrouped: structures.filter((s) => !s.groupId),
    renderQueue,
    debugOverlappingLabels: false,
    ...overrides,
  };
}

describe('STRUCTURE_LAYERS', () => {
  it('has exactly 6 layers in correct order', () => {
    expect(STRUCTURE_LAYERS).toHaveLength(6);
    expect(STRUCTURE_LAYERS.map((l) => l.id)).toEqual([
      'structure-bodies',
      'structure-walls',
      'structure-surfaces',
      'structure-plantable-area',
      'structure-highlights',
      'structure-labels',
    ]);
  });

  it('structure-bodies has alwaysOn=true', () => {
    const layer = STRUCTURE_LAYERS.find((l) => l.id === 'structure-bodies');
    expect(layer?.alwaysOn).toBe(true);
  });

  it('structure-plantable-area has defaultVisible=false', () => {
    const layer = STRUCTURE_LAYERS.find((l) => l.id === 'structure-plantable-area');
    expect(layer?.defaultVisible).toBe(false);
  });

  it('structure-highlights does not draw when highlightOpacity=0', () => {
    const ctx = makeCtx();
    const data = makeData({ highlightOpacity: 0 });
    const layer = STRUCTURE_LAYERS.find((l) => l.id === 'structure-highlights')!;
    layer.draw(ctx, data);
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('structure-highlights draws when highlightOpacity > 0', () => {
    const ctx = makeCtx();
    const data = makeData({ highlightOpacity: 0.5 });
    const layer = STRUCTURE_LAYERS.find((l) => l.id === 'structure-highlights')!;
    layer.draw(ctx, data);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('structure-labels skips rendering when labelMode is none', () => {
    const ctx = makeCtx();
    const s = makeStructure({ label: 'Test' });
    const data = makeData({ structures: [s], labelMode: 'none' });
    const layer = STRUCTURE_LAYERS.find((l) => l.id === 'structure-labels')!;
    layer.draw(ctx, data);
    expect(ctx.save).not.toHaveBeenCalled();
  });
});

describe('buildStructureRenderQueue', () => {
  it('separates grouped and ungrouped structures', () => {
    const s1 = makeStructure({ id: 's1', zIndex: 0, groupId: null });
    const s2 = makeStructure({ id: 's2', zIndex: 1, groupId: 'g1' });
    const s3 = makeStructure({ id: 's3', zIndex: 2, groupId: 'g1' });

    const { renderQueue, groups } = buildStructureRenderQueue([s1, s2, s3]);

    expect(groups.has('g1')).toBe(true);
    expect(groups.get('g1')).toHaveLength(2);

    const singleItems = renderQueue.filter((i) => i.type === 'single');
    const groupItems = renderQueue.filter((i) => i.type === 'group');
    expect(singleItems).toHaveLength(1);
    expect(groupItems).toHaveLength(1);
  });

  it('returns empty renderQueue for empty input', () => {
    const { renderQueue, groups } = buildStructureRenderQueue([]);
    expect(renderQueue).toHaveLength(0);
    expect(groups.size).toBe(0);
  });

  it('sorts render queue by zIndex order', () => {
    const s1 = makeStructure({ id: 's1', zIndex: 10, groupId: null });
    const s2 = makeStructure({ id: 's2', zIndex: 0, groupId: null });
    const { renderQueue } = buildStructureRenderQueue([s1, s2]);
    // s2 has lower zIndex so should come first
    expect((renderQueue[0] as { type: 'single'; structure: Structure }).structure.id).toBe('s2');
    expect((renderQueue[1] as { type: 'single'; structure: Structure }).structure.id).toBe('s1');
  });
});
