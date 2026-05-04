import { describe, expect, it, vi } from 'vitest';
import { createTray } from '../../model/seedStarting';
import { createTrayLayers } from './trayLayersWorld';

function makeCtx(): CanvasRenderingContext2D {
  return {
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
  } as unknown as CanvasRenderingContext2D;
}

const view = { x: 0, y: 0, scale: 30 };

describe('createTrayLayers (world)', () => {
  it('returns 3 layers in canonical order', () => {
    const layers = createTrayLayers(() => []);
    expect(layers.map((l) => l.id)).toEqual(['tray-body', 'tray-wells', 'tray-grid']);
  });

  it('tray-body draws roundRect at origin (0,0) in inches', () => {
    const ctx = makeCtx();
    const tray = createTray({ rows: 2, cols: 2, cellSize: 'small', label: 't' });
    const layer = createTrayLayers(() => [tray])[0];
    layer.draw(ctx, {}, view);
    expect(ctx.roundRect).toHaveBeenCalledWith(0, 0, tray.widthIn, tray.heightIn, expect.any(Number));
  });

  it('tray-body lineWidth is 1/scale (screen-pixel stroke in world units)', () => {
    const ctx = makeCtx();
    const tray = createTray({ rows: 1, cols: 1, cellSize: 'small', label: 't' });
    const layer = createTrayLayers(() => [tray])[0];
    layer.draw(ctx, {}, { x: 0, y: 0, scale: 20 });
    expect(ctx.lineWidth).toBeCloseTo(1 / 20);
  });

  it('tray-wells draws one arc per cell', () => {
    const ctx = makeCtx();
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'small', label: 't' });
    const layer = createTrayLayers(() => [tray]).find((l) => l.id === 'tray-wells')!;
    layer.draw(ctx, {}, view);
    expect((ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBe(6);
  });

  it('tray-grid draws a dot per cell', () => {
    const ctx = makeCtx();
    const tray = createTray({ rows: 2, cols: 2, cellSize: 'small', label: 't' });
    const layer = createTrayLayers(() => [tray]).find((l) => l.id === 'tray-grid')!;
    layer.draw(ctx, {}, view);
    expect((ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4);
  });
});
