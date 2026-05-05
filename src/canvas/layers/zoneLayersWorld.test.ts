import { describe, it, expect, vi } from 'vitest';
import { createZoneLayers } from './zoneLayersWorld';
import type { Zone } from '../../model/types';
import type { GetUi } from './worldLayerData';

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

function makeZone(over: Partial<Zone> = {}): Zone {
  return {
    id: 'z1', x: 0, y: 0, width: 10, length: 10,
    color: '#aabbcc', zIndex: 0, label: '', pattern: null, ...over,
  } as Zone;
}

const view = { x: 0, y: 0, scale: 5 };

const baseUi: ReturnType<GetUi> = {
  selectedIds: [],
  labelMode: 'none',
  labelFontSize: 13,
  plantIconScale: 1,
  showFootprintCircles: true,
  getOpacity: () => 0,
  debugOverlappingLabels: false,
  dragClashIds: [],
};

describe('createZoneLayers (world)', () => {
  it('returns 4 layers in canonical order', () => {
    const layers = createZoneLayers(() => [], () => baseUi);
    expect(layers.map((l) => l.id)).toEqual(['zone-bodies', 'zone-patterns', 'zone-highlights', 'zone-labels']);
  });

  it('zone-bodies draws fillRect at raw world coords', () => {
    const ctx = makeCtx();
    const z = makeZone({ x: 1, y: 2, width: 3, length: 4 });
    const layer = createZoneLayers(() => [z], () => baseUi)[0];
    layer.draw(ctx, {}, view);
    expect(ctx.fillRect).toHaveBeenCalledWith(1, 2, 3, 4);
    expect(ctx.strokeRect).toHaveBeenCalledWith(1, 2, 3, 4);
  });

  it('zone-bodies scales dash pattern by 1/view.scale', () => {
    const ctx = makeCtx();
    const z = makeZone();
    const layer = createZoneLayers(() => [z], () => baseUi)[0];
    layer.draw(ctx, {}, { x: 0, y: 0, scale: 5 });
    // [6, 3] in screen px → [1.2, 0.6] in world units
    expect(ctx.setLineDash).toHaveBeenCalledWith([1.2, 0.6]);
  });

  it('zone-highlights skips zones with getOpacity(id)=0', () => {
    const ctx = makeCtx();
    const z = makeZone();
    const layer = createZoneLayers(() => [z], () => baseUi).find((l) => l.id === 'zone-highlights')!;
    layer.draw(ctx, {}, view);
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('zone-highlights draws only the zones whose getOpacity(id)>0', () => {
    const ctx = makeCtx();
    const za = makeZone({ id: 'a', x: 0, y: 0 });
    const zb = makeZone({ id: 'b', x: 5, y: 5 });
    const ui: ReturnType<GetUi> = {
      ...baseUi,
      getOpacity: (id: string) => (id === 'a' ? 0.5 : 0),
    };
    const layer = createZoneLayers(() => [za, zb], () => ui).find((l) => l.id === 'zone-highlights')!;
    layer.draw(ctx, {}, view);
    // Only one zone (id 'a') should have been highlighted.
    expect((ctx.save as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((ctx.strokeRect as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
