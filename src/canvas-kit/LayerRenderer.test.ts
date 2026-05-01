import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerRenderer } from './LayerRenderer';

class TestRenderer extends LayerRenderer {
  drawCalls = 0;
  lastAlpha: number | undefined;
  protected draw(ctx: CanvasRenderingContext2D): void {
    this.drawCalls++;
    this.lastAlpha = (ctx as { globalAlpha: number }).globalAlpha;
  }
}

function makeCtx() {
  const calls: string[] = [];
  const state = { globalAlpha: 1 };
  const ctx = {
    get globalAlpha() { return state.globalAlpha; },
    set globalAlpha(v: number) { state.globalAlpha = v; },
    clearRect: vi.fn(() => calls.push('clearRect')),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, state };
}

describe('LayerRenderer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the canvas and calls draw on render', () => {
    const r = new TestRenderer();
    r.setView({ panX: 0, panY: 0, zoom: 1 }, 100, 50);
    const { ctx, calls } = makeCtx();
    r.render(ctx);
    expect(calls).toContain('clearRect');
    expect(r.drawCalls).toBe(1);
  });

  it('skips draw entirely when opacity is 0', () => {
    const r = new TestRenderer();
    r.opacity = 0;
    const { ctx } = makeCtx();
    r.render(ctx);
    expect(r.drawCalls).toBe(0);
  });

  it('sets globalAlpha to opacity during draw, then resets to 1', () => {
    const r = new TestRenderer();
    r.opacity = 0.5;
    const { ctx, state } = makeCtx();
    r.render(ctx);
    expect(r.lastAlpha).toBe(0.5);
    expect(state.globalAlpha).toBe(1);
  });

  it('setView updates view, width, height', () => {
    const r = new TestRenderer();
    r.setView({ panX: 1, panY: 2, zoom: 3 }, 800, 600);
    expect(r.view).toEqual({ panX: 1, panY: 2, zoom: 3 });
    expect(r.width).toBe(800);
    expect(r.height).toBe(600);
  });

  it('setParams skips undefined values', () => {
    const r = new TestRenderer();
    r.opacity = 0.7;
    r.setParams({ opacity: undefined as unknown as number });
    expect(r.opacity).toBe(0.7);
    r.setParams({ opacity: 0.3 });
    expect(r.opacity).toBe(0.3);
  });

  it('setHoverHighlight(true) sets highlight to 1; off resets to 0', () => {
    const r = new TestRenderer();
    r.setHoverHighlight(true);
    expect(r.highlight).toBe(1);
    r.setHoverHighlight(false);
    expect(r.highlight).toBe(0);
  });

  it('flash() invokes onInvalidate via animation frame and decays highlight to 0 over time', () => {
    const r = new TestRenderer();
    const invalidate = vi.fn();
    r.onInvalidate(invalidate);

    // Fix performance.now to be controllable
    let now = 1000;
    const perfSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);

    r.flash();
    // first tick at start: elapsed = 0, fade-in fraction 0
    vi.advanceTimersToNextTimer();
    expect(invalidate).toHaveBeenCalled();

    // Advance past fade-in (80ms) + hold (600) + fade-out (320) = 1000ms
    now += 1500;
    // Multiple ticks may be needed; advance several frames
    for (let i = 0; i < 10; i++) vi.advanceTimersToNextTimer();
    expect(r.highlight).toBe(0);

    perfSpy.mockRestore();
  });

  it('dispose() cancels pending animation frame', () => {
    const r = new TestRenderer();
    r.onInvalidate(() => {});
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    r.flash();
    r.dispose();
    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });
});
