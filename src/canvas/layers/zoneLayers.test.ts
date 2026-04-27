import { describe, it, expect, vi } from 'vitest';
import { ZONE_LAYERS } from './zoneLayers';
import type { ZoneLayerData } from '../layerData';
import type { Zone } from '../../model/types';

function makeCtx(): CanvasRenderingContext2D {
  return {
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

const baseView = { panX: 0, panY: 0, zoom: 1 };

function makeZone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: 'z1',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    color: '#aabbcc',
    zIndex: 0,
    label: '',
    pattern: null,
    ...overrides,
  } as Zone;
}

function makeData(overrides: Partial<ZoneLayerData> = {}): ZoneLayerData {
  return {
    view: baseView,
    canvasWidth: 800,
    canvasHeight: 600,
    labelMode: 'none',
    labelFontSize: 13,
    highlightOpacity: 0,
    zones: [makeZone()],
    ...overrides,
  };
}

describe('ZONE_LAYERS', () => {
  it('has exactly 4 layers in correct order', () => {
    expect(ZONE_LAYERS).toHaveLength(4);
    expect(ZONE_LAYERS.map((l) => l.id)).toEqual([
      'zone-bodies',
      'zone-patterns',
      'zone-highlights',
      'zone-labels',
    ]);
  });

  it('zone-bodies has alwaysOn=true', () => {
    const bodiesLayer = ZONE_LAYERS.find((l) => l.id === 'zone-bodies');
    expect(bodiesLayer?.alwaysOn).toBe(true);
  });

  it('zone-bodies draws fill and dashed stroke for each zone', () => {
    const ctx = makeCtx();
    const data = makeData();
    const bodiesLayer = ZONE_LAYERS.find((l) => l.id === 'zone-bodies')!;
    bodiesLayer.draw(ctx, data);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalledWith([6, 3]);
    // Should reset dash after stroke
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
  });

  it('zone-highlights does not draw when highlightOpacity=0', () => {
    const ctx = makeCtx();
    const data = makeData({ highlightOpacity: 0 });
    const highlightLayer = ZONE_LAYERS.find((l) => l.id === 'zone-highlights')!;
    highlightLayer.draw(ctx, data);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('zone-highlights draws when highlightOpacity > 0', () => {
    const ctx = makeCtx();
    const data = makeData({ highlightOpacity: 0.5 });
    const highlightLayer = ZONE_LAYERS.find((l) => l.id === 'zone-highlights')!;
    highlightLayer.draw(ctx, data);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });
});
