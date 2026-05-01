import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPatternOverlay } from './patterns';

// In jsdom, HTMLCanvasElement.prototype.getContext returns null. We patch it
// per-test so pattern factories can run their offscreen-canvas code.

interface OffCall { fn: string; args: unknown[] }

function makeOffCtx(): { ctx: CanvasRenderingContext2D; calls: OffCall[] } {
  const calls: OffCall[] = [];
  const state = { strokeStyle: '', fillStyle: '', lineWidth: 0 };
  const rec = (fn: string) =>
    vi.fn((...args: unknown[]) => { calls.push({ fn, args }); });
  const ctx = {
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(v: string) { state.strokeStyle = v; },
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v: string) { state.fillStyle = v; },
    get lineWidth() { return state.lineWidth; },
    set lineWidth(v: number) { state.lineWidth = v; },
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    stroke: rec('stroke'),
    arc: rec('arc'),
    fill: rec('fill'),
    fillRect: rec('fillRect'),
    save: rec('save'),
    restore: rec('restore'),
    translate: rec('translate'),
    rotate: rec('rotate'),
    ellipse: rec('ellipse'),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

function makeMainCtx() {
  const calls: OffCall[] = [];
  const state = { fillStyle: null as unknown as CanvasPattern | string, globalAlpha: 1 };
  const rec = (fn: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ fn, args });
    });
  const fakePattern = { setTransform: vi.fn() } as unknown as CanvasPattern;
  const ctx = {
    get fillStyle() { return state.fillStyle as unknown as string; },
    set fillStyle(v: CanvasPattern | string) { state.fillStyle = v; },
    get globalAlpha() { return state.globalAlpha; },
    set globalAlpha(v: number) { state.globalAlpha = v; },
    save: rec('save'),
    restore: rec('restore'),
    fill: rec('fill'),
    fillRect: rec('fillRect'),
    beginPath: rec('beginPath'),
    ellipse: rec('ellipse'),
    createPattern: vi.fn(() => fakePattern),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, fakePattern };
}

let getContextSpy: ReturnType<typeof vi.spyOn> | null = null;

class FakeDOMMatrix {
  translateSelf() { return this; }
}

beforeEach(() => {
  if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
    (globalThis as unknown as { DOMMatrix: typeof FakeDOMMatrix }).DOMMatrix = FakeDOMMatrix;
  }
  // Patch HTMLCanvasElement.prototype.getContext to return a stub
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => makeOffCtx().ctx as unknown as RenderingContext,
  );
});

afterEach(() => {
  getContextSpy?.mockRestore();
});

describe('renderPatternOverlay', () => {
  it('returns early without painting when patternId is null', () => {
    const { ctx, calls } = makeMainCtx();
    renderPatternOverlay(ctx, null, { x: 0, y: 0, w: 10, h: 10, shape: 'rectangle' });
    expect(calls).toEqual([]);
  });

  it('returns early without painting when patternId is undefined', () => {
    const { ctx, calls } = makeMainCtx();
    renderPatternOverlay(ctx, undefined, { x: 0, y: 0, w: 10, h: 10, shape: 'rectangle' });
    expect(calls).toEqual([]);
  });

  it('paints a rectangle region using fillRect with inset', () => {
    const { ctx, calls } = makeMainCtx();
    renderPatternOverlay(ctx, 'hatch', { x: 10, y: 20, w: 100, h: 50, shape: 'rectangle' });
    const fr = calls.find((c) => c.fn === 'fillRect')!;
    expect(fr.args).toEqual([11, 21, 98, 48]);
    // save/restore wrap the draw
    expect(calls[0].fn).toBe('save');
    expect(calls[calls.length - 1].fn).toBe('restore');
  });

  it('paints a circle region using ellipse + fill', () => {
    const { ctx, calls } = makeMainCtx();
    renderPatternOverlay(ctx, 'dots', { x: 0, y: 0, w: 40, h: 40, shape: 'circle' });
    expect(calls.find((c) => c.fn === 'beginPath')).toBeDefined();
    expect(calls.find((c) => c.fn === 'ellipse')).toBeDefined();
    expect(calls.find((c) => c.fn === 'fill')).toBeDefined();
  });

  it('uses default opacity 0.9 when not provided', () => {
    const { ctx, calls } = makeMainCtx();
    let alphaAtFill = 0;
    const orig = (ctx as unknown as { fillRect: (...a: unknown[]) => void }).fillRect;
    (ctx as unknown as { fillRect: (...a: unknown[]) => void }).fillRect = (...args: unknown[]) => {
      alphaAtFill = (ctx as unknown as { globalAlpha: number }).globalAlpha;
      orig.call(ctx, ...args);
    };
    renderPatternOverlay(ctx, 'hatch', { x: 0, y: 0, w: 10, h: 10, shape: 'rectangle' });
    expect(alphaAtFill).toBe(0.9);
    void calls;
  });

  it('honors custom opacity', () => {
    const { ctx } = makeMainCtx();
    let alphaAtFill = 0;
    const orig = (ctx as unknown as { fillRect: (...a: unknown[]) => void }).fillRect;
    (ctx as unknown as { fillRect: (...a: unknown[]) => void }).fillRect = (...args: unknown[]) => {
      alphaAtFill = (ctx as unknown as { globalAlpha: number }).globalAlpha;
      orig.call(ctx, ...args);
    };
    renderPatternOverlay(ctx, 'hatch', { x: 0, y: 0, w: 10, h: 10, shape: 'rectangle' }, { opacity: 0.5 });
    expect(alphaAtFill).toBe(0.5);
  });

  it('caches patterns: same id+params reuses pattern (createPattern called once)', () => {
    const { ctx } = makeMainCtx();
    renderPatternOverlay(ctx, 'crosshatch', { x: 0, y: 0, w: 10, h: 10, shape: 'rectangle' });
    const firstCount = (ctx as unknown as { createPattern: { mock: { calls: unknown[] } } }).createPattern.mock.calls.length;
    renderPatternOverlay(ctx, 'crosshatch', { x: 50, y: 60, w: 10, h: 10, shape: 'rectangle' });
    const secondCount = (ctx as unknown as { createPattern: { mock: { calls: unknown[] } } }).createPattern.mock.calls.length;
    // Cache hit: same id+default params -> no new createPattern call
    expect(secondCount).toBe(firstCount);
  });

  it('different params produce a different cache key (new createPattern call)', () => {
    const { ctx } = makeMainCtx();
    renderPatternOverlay(ctx, 'hatch', { x: 0, y: 0, w: 10, h: 10, shape: 'rectangle' }, { params: { color: 'red' } });
    renderPatternOverlay(ctx, 'hatch', { x: 0, y: 0, w: 10, h: 10, shape: 'rectangle' }, { params: { color: 'blue' } });
    const create = (ctx as unknown as { createPattern: { mock: { calls: unknown[] } } }).createPattern;
    // At least 2 distinct factory invocations
    expect(create.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('chunks pattern is deterministic for a given seed (same key -> cache hit)', () => {
    const { ctx } = makeMainCtx();
    renderPatternOverlay(ctx, 'chunks', { x: 0, y: 0, w: 10, h: 10, shape: 'rectangle' }, { params: { seed: 7 } });
    const before = (ctx as unknown as { createPattern: { mock: { calls: unknown[] } } }).createPattern.mock.calls.length;
    renderPatternOverlay(ctx, 'chunks', { x: 100, y: 100, w: 10, h: 10, shape: 'rectangle' }, { params: { seed: 7 } });
    const after = (ctx as unknown as { createPattern: { mock: { calls: unknown[] } } }).createPattern.mock.calls.length;
    expect(after).toBe(before);
  });
});
