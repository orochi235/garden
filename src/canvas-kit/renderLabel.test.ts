import { describe, expect, it, vi } from 'vitest';
import { defaultLabelTextRenderer, renderLabel } from './renderLabel';

interface Call {
  fn: string;
  args: unknown[];
  fillStyle?: string;
  font?: string;
  textAlign?: string;
  textBaseline?: string;
}

function makeCtx() {
  const calls: Call[] = [];
  const state = { fillStyle: '', font: '', textAlign: '', textBaseline: '' };
  const rec = (fn: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ fn, args, ...state });
    });
  const ctx = {
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v: string) { state.fillStyle = v; },
    get font() { return state.font; },
    set font(v: string) { state.font = v; },
    get textAlign() { return state.textAlign; },
    set textAlign(v: string) { state.textAlign = v; },
    get textBaseline() { return state.textBaseline; },
    set textBaseline(v: string) { state.textBaseline = v; },
    save: rec('save'),
    restore: rec('restore'),
    beginPath: rec('beginPath'),
    fill: rec('fill'),
    roundRect: rec('roundRect'),
    fillText: rec('fillText'),
    measureText: vi.fn((t: string) => ({ width: t.length * 7 })),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('renderLabel', () => {
  it('saves and restores ctx state', () => {
    const { ctx, calls } = makeCtx();
    renderLabel(ctx, 'hi', 0, 0);
    expect(calls[0].fn).toBe('save');
    expect(calls[calls.length - 1].fn).toBe('restore');
  });

  it('draws a black 75%-opacity rounded pill behind text', () => {
    const { ctx, calls } = makeCtx();
    renderLabel(ctx, 'hi', 100, 50);
    const round = calls.find((c) => c.fn === 'roundRect');
    expect(round).toBeDefined();
    const fill = calls.find((c) => c.fn === 'fill');
    expect(fill?.fillStyle).toBe('rgba(0, 0, 0, 0.75)');
  });

  it('center-align positions pill so x is the horizontal midpoint', () => {
    const { ctx, calls } = makeCtx();
    // text "hi" -> width = 14, padX=4 -> w = 22; rx = 100 - 11 = 89
    renderLabel(ctx, 'hi', 100, 0, { align: 'center' });
    const round = calls.find((c) => c.fn === 'roundRect')!;
    expect(round.args[0]).toBe(89);
    expect(round.args[2]).toBe(22); // w
  });

  it('left-align positions pill so x is the left edge of the content', () => {
    const { ctx, calls } = makeCtx();
    renderLabel(ctx, 'hi', 100, 0, { align: 'left' });
    const round = calls.find((c) => c.fn === 'roundRect')!;
    // rx = x - padX = 100 - 4 = 96
    expect(round.args[0]).toBe(96);
  });

  it('honors width/height overrides', () => {
    const { ctx, calls } = makeCtx();
    renderLabel(ctx, 'x', 0, 0, { width: 100, height: 20, align: 'left' });
    const round = calls.find((c) => c.fn === 'roundRect')!;
    // w = 100 + 8 = 108, h = 20 + 2 = 22
    expect(round.args[2]).toBe(108);
    expect(round.args[3]).toBe(22);
  });

  it('uses fontSize in the font string', () => {
    const { ctx, calls } = makeCtx();
    renderLabel(ctx, 'hi', 0, 0, { fontSize: 20 });
    const fill = calls.find((c) => c.fn === 'fill')!;
    expect(fill.font).toBe('20px sans-serif');
  });

  it('invokes a custom renderText fn for the text', () => {
    const { ctx } = makeCtx();
    const renderText = vi.fn();
    renderLabel(ctx, 'hi', 10, 20, { renderText });
    expect(renderText).toHaveBeenCalledWith(ctx, 'hi', 10, 20);
  });

  it('default text renderer fills white text', () => {
    const calls: { fillStyle: string; args: unknown[] }[] = [];
    const state = { fillStyle: '' };
    const ctx = {
      get fillStyle() { return state.fillStyle; },
      set fillStyle(v: string) { state.fillStyle = v; },
      fillText: vi.fn((...args: unknown[]) => { calls.push({ fillStyle: state.fillStyle, args }); }),
    } as unknown as CanvasRenderingContext2D;
    defaultLabelTextRenderer(ctx, 'hi', 5, 6);
    expect(calls[0].fillStyle).toBe('#FFFFFF');
    expect(calls[0].args).toEqual(['hi', 5, 6]);
  });
});
