import { describe, expect, it, vi } from 'vitest';
import { createSeedling, createTray, setCell } from '../../model/seedStarting';
import { createSeedlingLayers, type SeedlingLayerUi } from './seedlingLayersWorld';

const view = { x: 0, y: 0, scale: 30 };

const baseUi: SeedlingLayerUi = {
  showWarnings: true,
  selectedIds: [],
  hiddenSeedlingIds: [],
  fillPreview: null,
};

const dims = { width: 800, height: 600 };

describe('createSeedlingLayers (world)', () => {
  it('returns 3 layers in canonical order', () => {
    const layers = createSeedlingLayers(() => [], () => [], () => baseUi);
    expect(layers.map((l) => l.id)).toEqual([
      'seedlings',
      'seedling-labels',
      'seedling-fill-preview',
    ]);
  });

  it('per-id getHighlight is invoked with each sown seedling id', () => {
    let tray = createTray({ rows: 1, cols: 2, cellSize: 'small', label: 't' });
    const a = createSeedling({ cultivarId: 'basil', trayId: tray.id, row: 0, col: 0 });
    const b = createSeedling({ cultivarId: 'basil', trayId: tray.id, row: 0, col: 1 });
    tray = setCell(tray, 0, 0, { state: 'sown', seedlingId: a.id });
    tray = setCell(tray, 0, 1, { state: 'sown', seedlingId: b.id });
    const getHighlight = vi.fn((id: string) => (id === a.id ? 0.7 : 0));
    const layer = createSeedlingLayers(
      () => [tray],
      () => [a, b],
      () => baseUi,
      getHighlight,
    )[0];
    layer.draw({}, view, dims);
    expect(getHighlight).toHaveBeenCalledWith(a.id);
    expect(getHighlight).toHaveBeenCalledWith(b.id);
  });
});
