import { describe, it, expect, vi } from 'vitest';
import {
  createSelectionOutlineLayer,
  createSelectionHandlesLayer,
  createGroupOutlineLayer,
  createAllHandlesLayer,
} from './selectionLayersWorld';
import type { Planting, Structure, Zone } from '../../model/types';
import type { Seedling, Tray } from '../../model/seedStarting';
import type { GetUi } from './worldLayerData';

function makeCtx(): CanvasRenderingContext2D {
  return {
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 30 })),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
}

function makeStructure(over: Partial<Structure> = {}): Structure {
  return {
    id: 's1', type: 'raised-bed',
    x: 0, y: 0, width: 10, height: 10,
    color: '#ccc', label: 'Bed',
    container: true,
    ...over,
  } as unknown as Structure;
}

function makeZone(over: Partial<Zone> = {}): Zone {
  return {
    id: 'z1', x: 0, y: 0, width: 10, height: 10,
    color: '#aabbcc', zIndex: 0, label: '', pattern: null,
    ...over,
  } as Zone;
}

const view = { x: 0, y: 0, scale: 10 };

function ui(over: Partial<ReturnType<GetUi>> = {}): ReturnType<GetUi> {
  return {
    selectedIds: [],
    labelMode: 'none',
    labelFontSize: 13,
    plantIconScale: 1,
    showFootprintCircles: true,
    highlightOpacity: 0,
    debugOverlappingLabels: false,
    ...over,
  };
}

describe('createSelectionOutlineLayer', () => {
  it('draws nothing when nothing selected', () => {
    const ctx = makeCtx();
    const layer = createSelectionOutlineLayer(() => [], () => [], () => [makeStructure()], () => ui());
    layer.draw(ctx, {}, view);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('draws dashed outline at world coords for selected structure', () => {
    const ctx = makeCtx();
    const s = makeStructure({ x: 2, y: 3, width: 5, height: 5 });
    const layer = createSelectionOutlineLayer(() => [], () => [], () => [s], () => ui({ selectedIds: ['s1'] }));
    layer.draw(ctx, {}, view);
    expect(ctx.setLineDash).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
    // verify world-coord call (with the inset of 1/scale = 0.1)
    const [x, y] = (ctx.strokeRect as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(x).toBeCloseTo(1.9);
    expect(y).toBeCloseTo(2.9);
  });

  it('uses ellipse for circular selected zones', () => {
    const ctx = makeCtx();
    const z = makeZone({ id: 'z1' }) as Zone & { shape?: string };
    (z as Zone & { shape: string }).shape = 'circle';
    const layer = createSelectionOutlineLayer(() => [], () => [z], () => [], () => ui({ selectedIds: ['z1'] }));
    layer.draw(ctx, {}, view);
    expect(ctx.ellipse).toHaveBeenCalled();
  });
});

describe('createGroupOutlineLayer', () => {
  it('draws nothing when no selection', () => {
    const ctx = makeCtx();
    const a = makeStructure({ id: 'a', groupId: 'g', x: 0, y: 0, width: 2, height: 2 });
    const layer = createGroupOutlineLayer(() => [a], () => ui());
    layer.draw(ctx, {}, view);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('draws nothing when the selected member is ungrouped', () => {
    const ctx = makeCtx();
    const a = makeStructure({ id: 'a', groupId: null });
    const layer = createGroupOutlineLayer(() => [a], () => ui({ selectedIds: ['a'] }));
    layer.draw(ctx, {}, view);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('draws nothing when the group has only one member', () => {
    const ctx = makeCtx();
    const a = makeStructure({ id: 'a', groupId: 'g' });
    const layer = createGroupOutlineLayer(() => [a], () => ui({ selectedIds: ['a'] }));
    layer.draw(ctx, {}, view);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('draws the union AABB of all members when one is selected', () => {
    const ctx = makeCtx();
    const a = makeStructure({ id: 'a', groupId: 'g', x: 0, y: 0, width: 2, height: 2 });
    const b = makeStructure({ id: 'b', groupId: 'g', x: 5, y: 6, width: 3, height: 4 });
    const layer = createGroupOutlineLayer(() => [a, b], () => ui({ selectedIds: ['a'] }));
    layer.draw(ctx, {}, view);
    const calls = (ctx.strokeRect as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    // union: x∈[0,8], y∈[0,10]. inset = 4/scale = 0.4.
    const [x, y, w, h] = calls[0];
    expect(x).toBeCloseTo(-0.4);
    expect(y).toBeCloseTo(-0.4);
    expect(w).toBeCloseTo(8.8);
    expect(h).toBeCloseTo(10.8);
  });

  it('draws each group only once when multiple members of the same group are selected', () => {
    const ctx = makeCtx();
    const a = makeStructure({ id: 'a', groupId: 'g', x: 0, y: 0, width: 2, height: 2 });
    const b = makeStructure({ id: 'b', groupId: 'g', x: 5, y: 5, width: 2, height: 2 });
    const layer = createGroupOutlineLayer(() => [a, b], () => ui({ selectedIds: ['a', 'b'] }));
    layer.draw(ctx, {}, view);
    expect((ctx.strokeRect as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

describe('createSelectionHandlesLayer', () => {
  it('declares space=screen so handles stay sharp at any zoom', () => {
    const layer = createSelectionHandlesLayer(() => [], () => [], () => ui());
    expect(layer.space).toBe('screen');
  });

  it('draws nothing when nothing selected', () => {
    const ctx = makeCtx();
    const layer = createSelectionHandlesLayer(() => [], () => [makeStructure()], () => ui());
    layer.draw(ctx, {}, view);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('draws 8 handles at screen-projected positions for a selected structure', () => {
    const ctx = makeCtx();
    const s = makeStructure({ x: 2, y: 3, width: 4, height: 4 });
    const layer = createSelectionHandlesLayer(() => [], () => [s], () => ui({ selectedIds: ['s1'] }));
    // view {x:0, y:0, scale: 10} → object spans screen [20..60, 30..70]
    layer.draw(ctx, {}, { x: 0, y: 0, scale: 10 });
    const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(8);
    // NW handle (8x8) centered at screen (20, 30) → fillRect(16, 26, 8, 8)
    expect(calls[0]).toEqual([16, 26, 8, 8]);
  });
});

describe('createAllHandlesLayer (?debug=handles)', () => {
  it('declares space=screen so handles stay sharp at any zoom', () => {
    const layer = createAllHandlesLayer({});
    expect(layer.space).toBe('screen');
  });

  it('iterates over ALL structures + zones regardless of selection state', () => {
    const ctx = makeCtx();
    const s1 = makeStructure({ id: 's1', x: 0, y: 0, width: 1, height: 1 });
    const s2 = makeStructure({ id: 's2', x: 5, y: 5, width: 1, height: 1 });
    const z1 = makeZone({ id: 'z1', x: 2, y: 2, width: 1, height: 1 });
    const layer = createAllHandlesLayer({
      getStructures: () => [s1, s2],
      getZones: () => [z1],
    });
    // No selection input is wired — overlay is unconditional.
    layer.draw(ctx, {}, view);
    // 8 handles per rect × 3 rects = 24 fillRect calls.
    expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(24);
  });

  it('draws a single handle dot per planting at its world pose', () => {
    const ctx = makeCtx();
    const parent = makeStructure({ id: 'p', x: 10, y: 10, width: 4, height: 4 });
    const planting: Planting = {
      id: 'pl1', cultivarId: 'c', parentId: 'p', x: 1, y: 2,
    } as unknown as Planting;
    const layer = createAllHandlesLayer({
      getStructures: () => [parent],
      getPlantings: () => [planting],
    });
    layer.draw(ctx, {}, { x: 0, y: 0, scale: 10 });
    const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
    // Parent: 8 handles. Planting dot: 1. Total 9.
    expect(calls).toHaveLength(9);
    // Last call = planting dot, world (11, 12) → screen (110, 120), 5×5 centred.
    expect(calls[calls.length - 1]).toEqual([107.5, 117.5, 5, 5]);
  });

  it('draws a handle dot per seedling at its tray cell centre', () => {
    const ctx = makeCtx();
    const tray: Tray = {
      id: 't1', label: 't', cellSize: 'small', rows: 2, cols: 2,
      cellPitchIn: 2, widthIn: 4, heightIn: 4, slots: [],
    } as unknown as Tray;
    const seedling: Seedling = {
      id: 'sd1', cultivarId: 'c', trayId: 't1', row: 0, col: 1, labelOverride: null,
    };
    const layer = createAllHandlesLayer({
      getTrays: () => [tray],
      getSeedlings: () => [seedling],
    });
    layer.draw(ctx, {}, { x: 0, y: 0, scale: 1 });
    const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    // Cell (row=0, col=1) centre: x = 0 + 1.5*2 = 3; y = 0 + 0.5*2 = 1.
    // 5×5 dot centred → fillRect(0.5, -1.5, 5, 5)
    expect(calls[0]).toEqual([0.5, -1.5, 5, 5]);
  });

  it('uses lower opacity to be visually distinct from real selection handles', () => {
    const ctx = makeCtx();
    const s = makeStructure({ x: 0, y: 0, width: 1, height: 1 });
    const seenAlphas: number[] = [];
    Object.defineProperty(ctx, 'globalAlpha', {
      get() { return 1; },
      set(v: number) { seenAlphas.push(v); },
      configurable: true,
    });
    const layer = createAllHandlesLayer({ getStructures: () => [s] });
    layer.draw(ctx, {}, view);
    // Layer should set globalAlpha < 1 at some point.
    expect(seenAlphas.some((a) => a > 0 && a < 1)).toBe(true);
  });
});
