import { describe, expect, it, vi } from 'vitest';
import { createSeedling, createTray, setCell } from '../../model/seedStarting';
import { createSeedlingLayers, type SeedlingLayerUi } from './seedlingLayersWorld';

function makeCtx(): CanvasRenderingContext2D {
  return {
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 20 })),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
  } as unknown as CanvasRenderingContext2D;
}

const view = { x: 0, y: 0, scale: 30 };

const baseUi: SeedlingLayerUi = {
  showWarnings: true,
  selectedIds: [],
  hiddenSeedlingIds: [],
  fillPreview: null,
  movePreview: null,
};

describe('createSeedlingLayers (world)', () => {
  it('returns 4 layers in canonical order', () => {
    const layers = createSeedlingLayers(() => [], () => [], () => baseUi);
    expect(layers.map((l) => l.id)).toEqual([
      'seedlings',
      'seedling-labels',
      'seedling-fill-preview',
      'seedling-move-preview',
    ]);
  });

  it('seedlings layer draws nothing when no sown cells', () => {
    const ctx = makeCtx();
    const tray = createTray({ rows: 2, cols: 2, cellSize: 'small', label: 't' });
    const layer = createSeedlingLayers(() => [tray], () => [], () => baseUi)[0];
    layer.draw(ctx, {}, view);
    // The per-tray world transform wraps the inner draw with save/translate/restore,
    // but no glyph/cell-level drawing should happen.
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('seedlings layer translates to cell center for each sown seedling', () => {
    const ctx = makeCtx();
    let tray = createTray({ rows: 2, cols: 2, cellSize: 'small', label: 't' });
    const seedling = createSeedling({ cultivarId: 'basil', trayId: tray.id, row: 0, col: 1 });
    tray = setCell(tray, 0, 1, { state: 'sown', seedlingId: seedling.id });
    const layer = createSeedlingLayers(() => [tray], () => [seedling], () => baseUi)[0];
    layer.draw(ctx, {}, view);
    expect(ctx.translate).toHaveBeenCalled();
  });

  it('seedling-labels draws label text for each sown seedling', () => {
    const ctx = makeCtx();
    let tray = createTray({ rows: 1, cols: 1, cellSize: 'small', label: 't' });
    const seedling = createSeedling({ cultivarId: 'basil', trayId: tray.id, row: 0, col: 0 });
    tray = setCell(tray, 0, 0, { state: 'sown', seedlingId: seedling.id });
    const layer = createSeedlingLayers(() => [tray], () => [seedling], () => baseUi)
      .find((l) => l.id === 'seedling-labels')!;
    layer.draw(ctx, {}, view);
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('fill-preview skips when no preview set', () => {
    const ctx = makeCtx();
    const tray = createTray({ rows: 1, cols: 1, cellSize: 'small', label: 't' });
    const layer = createSeedlingLayers(() => [tray], () => [], () => baseUi)
      .find((l) => l.id === 'seedling-fill-preview')!;
    layer.draw(ctx, {}, view);
    expect(ctx.translate).not.toHaveBeenCalled();
  });

  it('fill-preview honors trayId match (only draws on matching tray)', () => {
    const ctx = makeCtx();
    const tray = createTray({ rows: 2, cols: 2, cellSize: 'small', label: 't' });
    const ui: SeedlingLayerUi = {
      ...baseUi,
      fillPreview: { trayId: 'other-tray', cultivarId: 'basil', scope: 'all' },
    };
    const layer = createSeedlingLayers(() => [tray], () => [], () => ui)
      .find((l) => l.id === 'seedling-fill-preview')!;
    layer.draw(ctx, {}, view);
    // Wrapper translates per tray, but no preview glyphs should render.
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('move-preview skips when no preview set', () => {
    const ctx = makeCtx();
    const tray = createTray({ rows: 1, cols: 1, cellSize: 'small', label: 't' });
    const layer = createSeedlingLayers(() => [tray], () => [], () => baseUi)
      .find((l) => l.id === 'seedling-move-preview')!;
    layer.draw(ctx, {}, view);
    expect(ctx.translate).not.toHaveBeenCalled();
  });

  it('respects hiddenSeedlingIds (skips hidden seedlings)', () => {
    const ctx = makeCtx();
    let tray = createTray({ rows: 1, cols: 1, cellSize: 'small', label: 't' });
    const seedling = createSeedling({ cultivarId: 'basil', trayId: tray.id, row: 0, col: 0 });
    tray = setCell(tray, 0, 0, { state: 'sown', seedlingId: seedling.id });
    const ui: SeedlingLayerUi = { ...baseUi, hiddenSeedlingIds: [seedling.id] };
    const layer = createSeedlingLayers(() => [tray], () => [seedling], () => ui)[0];
    layer.draw(ctx, {}, view);
    // The hidden seedling's glyph should not render.
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});
