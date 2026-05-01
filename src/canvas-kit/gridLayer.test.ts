import { describe, expect, it, vi } from 'vitest';
import { createGridLayer } from './gridLayer';
import { IMPERIAL_INCHES } from './units';

interface RecordedCall {
  fn: string;
  args: number[];
  // Captured style at the time of the stroke/fill call.
  strokeStyle?: string;
  fillStyle?: string;
}

interface StubCtx {
  ctx: CanvasRenderingContext2D;
  calls: RecordedCall[];
}

function makeStubCtx(): StubCtx {
  const calls: RecordedCall[] = [];
  const state = { strokeStyle: '', fillStyle: '', lineWidth: 0 };

  const record = (fn: string, capture: 'stroke' | 'fill' | null = null) =>
    vi.fn((...args: number[]) => {
      const c: RecordedCall = { fn, args };
      if (capture === 'stroke') c.strokeStyle = state.strokeStyle;
      if (capture === 'fill') c.fillStyle = state.fillStyle;
      calls.push(c);
    });

  const ctx = {
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(v: string) { state.strokeStyle = v; },
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v: string) { state.fillStyle = v; },
    get lineWidth() { return state.lineWidth; },
    set lineWidth(v: number) { state.lineWidth = v; },
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke', 'stroke'),
    fillRect: record('fillRect', 'fill'),
    strokeRect: record('strokeRect', 'stroke'),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('createGridLayer', () => {
  it('exposes id "grid" and label "Grid"', () => {
    const layer = createGridLayer({
      cell: 10,
      bounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    });
    expect(layer.id).toBe('grid');
    expect(layer.label).toBe('Grid');
  });

  it('renders nothing when bounds are zero-sized', () => {
    const { ctx, calls } = makeStubCtx();
    const layer = createGridLayer({
      cell: 10,
      bounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    });
    layer.draw(ctx, undefined);
    expect(calls).toEqual([]);
  });

  it('draws 11+11=22 lines for a 10-cell grid over 100x100 bounds', () => {
    const { ctx, calls } = makeStubCtx();
    const layer = createGridLayer({
      cell: 10,
      bounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    });
    layer.draw(ctx, undefined);
    const strokes = calls.filter((c) => c.fn === 'stroke');
    expect(strokes).toHaveLength(22);
  });

  it('with accentEvery: 5, renders 3 accent lines per axis', () => {
    const { ctx, calls } = makeStubCtx();
    const layer = createGridLayer({
      cell: 10,
      accentEvery: 5,
      bounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      style: { accent: '#ff0000', line: '#222222' },
    });
    layer.draw(ctx, undefined);
    const strokes = calls.filter((c) => c.fn === 'stroke');
    // Total lines is still 22 (accent replaces, doesn't add).
    expect(strokes).toHaveLength(22);
    const accents = strokes.filter((c) => c.strokeStyle === '#ff0000');
    // 3 accent lines per axis (at x=0, x=50, x=100; same for y) = 6 total.
    expect(accents).toHaveLength(6);
  });

  it('with subdivisions: 4 adds sub-lines (3 per cell, per axis)', () => {
    const { ctx, calls } = makeStubCtx();
    // 1x1 cell area, cell=10, subdivisions=4 -> 3 sub lines per axis.
    const layer = createGridLayer({
      cell: 10,
      subdivisions: 4,
      bounds: () => ({ x: 0, y: 0, width: 10, height: 10 }),
    });
    layer.draw(ctx, undefined);
    const strokes = calls.filter((c) => c.fn === 'stroke');
    // Cell lines: 2 vertical + 2 horizontal = 4.
    // Sub lines: 3 vertical + 3 horizontal = 6.
    // Total: 10.
    expect(strokes).toHaveLength(10);
  });

  it('renders highlight before any lines (fillRect comes first)', () => {
    const { ctx, calls } = makeStubCtx();
    const layer = createGridLayer({
      cell: 10,
      bounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      highlight: () => ({ col: 2, row: 3 }),
    });
    layer.draw(ctx, undefined);
    const firstFill = calls.findIndex((c) => c.fn === 'fillRect');
    const firstStroke = calls.findIndex((c) => c.fn === 'stroke');
    expect(firstFill).toBeGreaterThanOrEqual(0);
    expect(firstStroke).toBeGreaterThanOrEqual(0);
    expect(firstFill).toBeLessThan(firstStroke);
    // Verify cell coords: (col*cell, row*cell, cell, cell) = (20, 30, 10, 10).
    const fill = calls.find((c) => c.fn === 'fillRect')!;
    expect(fill.args).toEqual([20, 30, 10, 10]);
  });

  it('skips fill when highlight returns null', () => {
    const { ctx, calls } = makeStubCtx();
    const layer = createGridLayer({
      cell: 10,
      bounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      highlight: () => null,
    });
    layer.draw(ctx, undefined);
    expect(calls.filter((c) => c.fn === 'fillRect')).toHaveLength(0);
  });

  it('resolves a tagged cell value via the registry (1ft -> 12in spacing)', () => {
    const { ctx, calls } = makeStubCtx();
    // 24in wide x 12in tall, cell = 1ft = 12in -> 3 vertical lines + 2 horizontal lines = 5 strokes.
    const layer = createGridLayer({
      cell: { value: 1, unit: 'ft' },
      registry: IMPERIAL_INCHES,
      bounds: () => ({ x: 0, y: 0, width: 24, height: 12 }),
    });
    layer.draw(ctx, undefined);
    const strokes = calls.filter((c) => c.fn === 'stroke');
    expect(strokes).toHaveLength(5);
    // First vertical line at x=0, second at x=12 (one foot = 12 inches).
    const moves = calls.filter((c) => c.fn === 'moveTo');
    expect(moves[0].args).toEqual([0, 0]);
    expect(moves[1].args).toEqual([12, 0]);
  });

  it('throws at draw time when a tagged cell is given without a registry', () => {
    const { ctx } = makeStubCtx();
    const layer = createGridLayer({
      cell: { value: 1, unit: 'ft' },
      bounds: () => ({ x: 0, y: 0, width: 24, height: 12 }),
    });
    expect(() => layer.draw(ctx, undefined)).toThrow(/UnitRegistry/);
  });

  it('honors custom style colors', () => {
    const { ctx, calls } = makeStubCtx();
    const layer = createGridLayer({
      cell: 10,
      accentEvery: 5,
      bounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      style: { line: '#abcdef', accent: '#fedcba' },
      highlight: () => ({ col: 0, row: 0 }),
      highlightStyle: { fill: '#123456' },
    });
    layer.draw(ctx, undefined);
    const strokes = calls.filter((c) => c.fn === 'stroke');
    const lineColors = new Set(strokes.map((s) => s.strokeStyle));
    expect(lineColors.has('#abcdef')).toBe(true);
    expect(lineColors.has('#fedcba')).toBe(true);
    const fill = calls.find((c) => c.fn === 'fillRect')!;
    expect(fill.fillStyle).toBe('#123456');
  });
});
