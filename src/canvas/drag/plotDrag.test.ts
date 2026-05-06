import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createPlotDrag, PLOT_DRAG_KIND, type PlotPutative } from './plotDrag';

describe('plotDrag', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });
  afterEach(() => {
    useUiStore.getState().setDragPreview(null);
  });

  it('exposes the expected kind', () => {
    const drag = createPlotDrag();
    expect(drag.kind).toBe(PLOT_DRAG_KIND);
  });

  it('compute returns null when start === current (zero-size)', () => {
    const drag = createPlotDrag();
    expect(
      drag.compute({
        start: { x: 1, y: 1 },
        current: { x: 1, y: 1 },
        entityKind: 'structure',
        color: '#7fb069',
      }),
    ).toBeNull();
  });

  it('compute echoes the input as a putative when populated', () => {
    const drag = createPlotDrag();
    const putative = drag.compute({
      start: { x: 1, y: 2 },
      current: { x: 5, y: 8 },
      entityKind: 'zone',
      color: '#abcdef',
    });
    expect(putative).toEqual({
      start: { x: 1, y: 2 },
      current: { x: 5, y: 8 },
      entityKind: 'zone',
      color: '#abcdef',
    });
  });

  it('renderPreview draws translucent fill + dashed outline at the rectangle bounds', () => {
    const drag = createPlotDrag();
    const calls: { fn: string; args: unknown[] }[] = [];
    let lastFillStyle = '';
    let lastStrokeStyle = '';
    const ctx = {
      save: () => calls.push({ fn: 'save', args: [] }),
      restore: () => calls.push({ fn: 'restore', args: [] }),
      fillRect: (...args: unknown[]) => calls.push({ fn: 'fillRect', args }),
      strokeRect: (...args: unknown[]) => calls.push({ fn: 'strokeRect', args }),
      setLineDash: (a: number[]) => { calls.push({ fn: 'setLineDash', args: [a] }); },
      get fillStyle() { return lastFillStyle; },
      set fillStyle(v: string) { lastFillStyle = v; },
      get strokeStyle() { return lastStrokeStyle; },
      set strokeStyle(v: string) { lastStrokeStyle = v; },
      lineWidth: 0,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    const putative: PlotPutative = {
      start: { x: 2, y: 3 },
      current: { x: 7, y: 9 },
      entityKind: 'zone',
      color: '#7fb069',
    };
    drag.renderPreview(ctx, putative, { x: 0, y: 0, scale: 50 });

    const filled = calls.find((c) => c.fn === 'fillRect');
    const stroked = calls.find((c) => c.fn === 'strokeRect');
    // Bounds: min(start, current) → (2, 3); size → (5, 6).
    expect(filled?.args).toEqual([2, 3, 5, 6]);
    expect(stroked?.args).toEqual([2, 3, 5, 6]);
    expect(lastFillStyle).toBe('#7fb069');
    expect(lastStrokeStyle).toBe('#7fb069');
    // Dashed outline drawn before reset.
    const dashCalls = calls.filter((c) => c.fn === 'setLineDash');
    expect(dashCalls.length).toBeGreaterThanOrEqual(2);
    expect((dashCalls[0].args[0] as number[]).length).toBe(2);
  });

  it('renderPreview normalizes inverted rectangles (current < start)', () => {
    const drag = createPlotDrag();
    const calls: { fn: string; args: unknown[] }[] = [];
    const ctx = {
      save: () => {},
      restore: () => {},
      fillRect: (...args: unknown[]) => calls.push({ fn: 'fillRect', args }),
      strokeRect: (...args: unknown[]) => calls.push({ fn: 'strokeRect', args }),
      setLineDash: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    drag.renderPreview(
      ctx,
      {
        start: { x: 10, y: 10 },
        current: { x: 4, y: 6 },
        entityKind: 'structure',
        color: '#000',
      },
      { x: 0, y: 0, scale: 50 },
    );
    const filled = calls.find((c) => c.fn === 'fillRect');
    expect(filled?.args).toEqual([4, 6, 6, 4]);
  });

  it('renderPreview is a no-op for a degenerate (zero-size) rectangle', () => {
    const drag = createPlotDrag();
    const calls: string[] = [];
    const ctx = new Proxy({}, {
      get(_t, prop) {
        calls.push(String(prop));
        return () => {};
      },
    }) as unknown as CanvasRenderingContext2D;
    drag.renderPreview(
      ctx,
      {
        start: { x: 5, y: 5 },
        current: { x: 5, y: 5 },
        entityKind: 'structure',
        color: '#000',
      },
      { x: 0, y: 0, scale: 50 },
    );
    expect(calls).toEqual([]);
  });

  it('commit is a no-op (real commit lives in useInsert.end)', () => {
    const drag = createPlotDrag();
    const before = useGardenStore.getState().garden;
    drag.commit({
      start: { x: 0, y: 0 },
      current: { x: 1, y: 1 },
      entityKind: 'structure',
      color: '#000',
    });
    expect(useGardenStore.getState().garden).toBe(before);
  });
});
