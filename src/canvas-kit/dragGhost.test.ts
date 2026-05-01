import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDragGhost } from './dragGhost';

let getContextSpy: ReturnType<typeof vi.spyOn> | null = null;
let paintCtx: { translate: ReturnType<typeof vi.fn>; clearRect: ReturnType<typeof vi.fn>; setTransform: ReturnType<typeof vi.fn> } | null = null;

beforeEach(() => {
  paintCtx = {
    translate: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
  };
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => paintCtx as unknown as RenderingContext,
  );
});

afterEach(() => {
  getContextSpy?.mockRestore();
  document.body.innerHTML = '';
});

describe('createDragGhost', () => {
  it('appends a fixed-position canvas to document.body', () => {
    const ghost = createDragGhost({ sizeCss: 32, paint: () => {} });
    const canvases = document.body.querySelectorAll('canvas');
    expect(canvases.length).toBe(1);
    const cv = canvases[0] as HTMLCanvasElement;
    expect(cv.style.position).toBe('fixed');
    expect(cv.style.pointerEvents).toBe('none');
    ghost.destroy();
  });

  it('paints once on creation, calling paint with ctx and padded size', () => {
    const paint = vi.fn();
    createDragGhost({ sizeCss: 32, paint });
    expect(paint).toHaveBeenCalledTimes(1);
    // padded = max(8, ceil(32+4)) = 36
    expect(paint).toHaveBeenCalledWith(paintCtx, 36);
  });

  it('repaint() runs paint again', () => {
    const paint = vi.fn();
    const ghost = createDragGhost({ sizeCss: 32, paint });
    paint.mockClear();
    ghost.repaint();
    expect(paint).toHaveBeenCalledTimes(1);
    ghost.destroy();
  });

  it('move(x, y) sets left/top in CSS pixels', () => {
    const ghost = createDragGhost({ sizeCss: 32, paint: () => {} });
    ghost.move(123, 456);
    const cv = document.body.querySelector('canvas') as HTMLCanvasElement;
    expect(cv.style.left).toBe('123px');
    expect(cv.style.top).toBe('456px');
    ghost.destroy();
  });

  it('setHidden(true) hides the canvas via visibility; setHidden(false) restores', () => {
    const ghost = createDragGhost({ sizeCss: 32, paint: () => {} });
    const cv = document.body.querySelector('canvas') as HTMLCanvasElement;
    ghost.setHidden(true);
    expect(cv.style.visibility).toBe('hidden');
    ghost.setHidden(false);
    expect(cv.style.visibility).toBe('');
    ghost.destroy();
  });

  it('destroy() removes the canvas from the DOM', () => {
    const ghost = createDragGhost({ sizeCss: 32, paint: () => {} });
    expect(document.body.querySelector('canvas')).toBeTruthy();
    ghost.destroy();
    expect(document.body.querySelector('canvas')).toBeFalsy();
  });

  it('respects opacity option', () => {
    const ghost = createDragGhost({ sizeCss: 32, paint: () => {}, opacity: 0.5 });
    const cv = document.body.querySelector('canvas') as HTMLCanvasElement;
    expect(cv.style.opacity).toBe('0.5');
    ghost.destroy();
  });

  it('uses minimum padded size of 8px even for tiny sizeCss', () => {
    const paint = vi.fn();
    createDragGhost({ sizeCss: 1, paint });
    expect(paint).toHaveBeenCalledWith(paintCtx, 8);
  });
});
