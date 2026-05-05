import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ToolCtx } from '@orochi235/weasel';
import { useEricClickZoomTool } from './useEricClickZoomTool';
import type { View } from '../layers/worldLayerData';

function makeCtx(
  view: View,
  setView: (v: View) => void,
  rect: Partial<DOMRect> = {},
  modifiers: Partial<ToolCtx<null>['modifiers']> = {},
): ToolCtx<null> {
  const r = new DOMRect(rect.x ?? 0, rect.y ?? 0, rect.width ?? 200, rect.height ?? 200);
  return {
    worldX: 0,
    worldY: 0,
    modifiers: {
      alt: false, shift: false, meta: false, ctrl: false, space: false,
      ...modifiers,
    },
    selection: {} as never,
    adapter: null,
    applyBatch: () => {},
    view,
    setView,
    canvasRect: r,
    scratch: null,
  };
}

function pointer(init: Partial<PointerEventInit> & { button?: number; shiftKey?: boolean; clientX?: number; clientY?: number }): PointerEvent {
  const e = new Event('pointerdown') as PointerEvent;
  Object.assign(e, {
    button: 0,
    buttons: 1,
    clientX: 0, clientY: 0,
    ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    preventDefault: vi.fn(),
    ...init,
  });
  return e;
}

describe('useEricClickZoomTool', () => {
  it('claims plain left-button presses', () => {
    const { result } = renderHook(() => useEricClickZoomTool());
    const setView = vi.fn();
    const ctx = makeCtx({ x: 0, y: 0, scale: 50 }, setView);
    const decision = result.current.pointer!.onDown!(pointer({ button: 0 }), ctx);
    expect(decision).toBe('claim');
    expect(setView).toHaveBeenCalledTimes(1);
  });

  it('passes on non-left buttons (right-drag-pan stays available)', () => {
    const { result } = renderHook(() => useEricClickZoomTool());
    const setView = vi.fn();
    const ctx = makeCtx({ x: 0, y: 0, scale: 50 }, setView);
    const decision = result.current.pointer!.onDown!(pointer({ button: 2 }), ctx);
    expect(decision).toBe('pass');
    expect(setView).not.toHaveBeenCalled();
  });

  it('zooms about the cursor; world point under cursor stays invariant', () => {
    const { result } = renderHook(() => useEricClickZoomTool());
    const setView = vi.fn();
    const ctx = makeCtx(
      { x: 0, y: 0, scale: 50 },
      setView,
      { x: 10, y: 5, width: 400, height: 300 } as Partial<DOMRect>,
    );
    result.current.pointer!.onDown!(pointer({ button: 0, clientX: 110, clientY: 105 }), ctx);
    const next = setView.mock.calls[0][0] as View;
    // anchor in canvas coords: (100, 100); world point = (2, 2).
    expect(100 / next.scale + next.x).toBeCloseTo(2);
    expect(100 / next.scale + next.y).toBeCloseTo(2);
    expect(next.scale).toBeCloseTo(50 * 1.5);
  });

  it('shift-click inverts to zoom out (1/factor)', () => {
    const { result } = renderHook(() => useEricClickZoomTool());
    const setView = vi.fn();
    const ctx = makeCtx({ x: 0, y: 0, scale: 60 }, setView);
    result.current.pointer!.onDown!(pointer({ button: 0, shiftKey: true }), ctx);
    const next = setView.mock.calls[0][0] as View;
    expect(next.scale).toBeCloseTo(60 / 1.5);
  });

  it('clamps to eric-tuned min/max (5 and 500)', () => {
    const { result } = renderHook(() => useEricClickZoomTool());
    const setView = vi.fn();
    const ctx = makeCtx({ x: 0, y: 0, scale: 400 }, setView);
    // Many zoom-ins should hit the max.
    for (let i = 0; i < 20; i++) {
      result.current.pointer!.onDown!(pointer({ button: 0 }), {
        ...ctx,
        view: (setView.mock.calls[setView.mock.calls.length - 1]?.[0] as View) ?? ctx.view,
      });
    }
    expect((setView.mock.calls[setView.mock.calls.length - 1][0] as View).scale).toBe(500);

    setView.mockClear();
    const ctx2 = makeCtx({ x: 0, y: 0, scale: 10 }, setView);
    for (let i = 0; i < 20; i++) {
      result.current.pointer!.onDown!(pointer({ button: 0, shiftKey: true }), {
        ...ctx2,
        view: (setView.mock.calls[setView.mock.calls.length - 1]?.[0] as View) ?? ctx2.view,
      });
    }
    expect((setView.mock.calls[setView.mock.calls.length - 1][0] as View).scale).toBe(5);
  });

  it('calls preventDefault when claiming (suppresses native context menu / browser zoom passthrough)', () => {
    const { result } = renderHook(() => useEricClickZoomTool());
    const ctx = makeCtx({ x: 0, y: 0, scale: 50 }, vi.fn());
    const e = pointer({ button: 0, shiftKey: true });
    result.current.pointer!.onDown!(e, ctx);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('exposes a cursor that flips with shift (zoom-in / zoom-out)', () => {
    const { result } = renderHook(() => useEricClickZoomTool());
    const cursor = result.current.cursor;
    if (typeof cursor !== 'function') {
      throw new Error('expected cursor to be a function of ctx');
    }
    const setView = vi.fn();
    const noShift = makeCtx({ x: 0, y: 0, scale: 50 }, setView);
    const withShift = makeCtx({ x: 0, y: 0, scale: 50 }, setView, {}, { shift: true });
    expect(cursor(noShift)).toBe('zoom-in');
    expect(cursor(withShift)).toBe('zoom-out');
  });
});
