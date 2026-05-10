import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDragGhost } from './dragGhost';

// jsdom does not implement HTMLCanvasElement.getContext(), so we stub it with
// enough surface area to exercise the paint path without errors.
function makeCtxStub() {
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
  };
}

beforeEach(() => {
  // Install stub before each test (fresh spy counts).
  HTMLCanvasElement.prototype.getContext = vi.fn(() => makeCtxStub()) as never;
  document.body.innerHTML = '';
});

describe('createDragGhost', () => {
  it('calls paint with a ctx-like object and the correct size at construction', () => {
    const paint = vi.fn();
    createDragGhost({ sizeCss: 40, paint });

    expect(paint).toHaveBeenCalledOnce();
    const [_ctx, size] = paint.mock.calls[0] as [unknown, number];
    // ctx is the stub returned by our getContext mock — verify it is truthy and
    // has a fillRect method (the shape the paint callers use).
    expect(_ctx).toBeTruthy();
    expect(typeof (_ctx as ReturnType<typeof makeCtxStub>).fillRect).toBe('function');
    expect(size).toBe(40);
  });

  it('move() centers the ghost on the given client coords', () => {
    const ghost = createDragGhost({ sizeCss: 60, paint: () => {} });
    ghost.move(200, 150);

    const wrapper = document.body.firstChild as HTMLElement;
    // Ghost is 60 × 60 px so it is offset by half (30 px) in each axis.
    expect(wrapper.style.transform).toBe('translate(170px, 120px)');
  });

  it('repaint() calls paint a second time', () => {
    const paint = vi.fn();
    const ghost = createDragGhost({ sizeCss: 40, paint });

    expect(paint).toHaveBeenCalledOnce();
    ghost.repaint();
    expect(paint).toHaveBeenCalledTimes(2);
  });

  it('setHidden(true) hides the ghost; setHidden(false) restores it', () => {
    const ghost = createDragGhost({ sizeCss: 40, paint: () => {} });
    const wrapper = document.body.firstChild as HTMLElement;

    ghost.setHidden(true);
    expect(wrapper.style.display).toBe('none');

    ghost.setHidden(false);
    expect(wrapper.style.display).toBe('');
  });

  it('destroy() removes the ghost from the DOM', () => {
    const ghost = createDragGhost({ sizeCss: 40, paint: () => {} });
    expect(document.body.children).toHaveLength(1);

    ghost.destroy();
    expect(document.body.children).toHaveLength(0);
  });
});
