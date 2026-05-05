import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ToolCtx } from '@orochi235/weasel';
import { useEricWheelZoomTool } from './useEricWheelZoomTool';
import type { View } from '../layers/worldLayerData';

function makeCtx(
  view: View,
  setView: (v: View) => void,
  rect: Partial<DOMRect> = {},
): ToolCtx<null> {
  const r = new DOMRect(rect.x ?? 0, rect.y ?? 0, rect.width ?? 200, rect.height ?? 200);
  return {
    worldX: 0,
    worldY: 0,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false, space: false },
    selection: {} as never,
    adapter: null,
    applyBatch: () => {},
    view,
    setView,
    canvasRect: r,
    scratch: null,
  };
}

function wheel(init: Partial<WheelEventInit>): WheelEvent {
  const e = new Event('wheel') as WheelEvent;
  Object.assign(e, {
    deltaX: 0, deltaY: 0, deltaZ: 0, deltaMode: 0,
    clientX: 0, clientY: 0,
    ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    preventDefault: vi.fn(),
    ...init,
  });
  return e;
}

describe('useEricWheelZoomTool', () => {
  it('claims plain wheel events (no modifier required)', () => {
    const { result } = renderHook(() => useEricWheelZoomTool());
    const setView = vi.fn();
    const ctx = makeCtx({ x: 0, y: 0, scale: 50 }, setView);
    const decision = result.current.wheel!.onWheel!(wheel({ deltaY: -100 }), ctx);
    expect(decision).toBe('claim');
    expect(setView).toHaveBeenCalledTimes(1);
  });

  it('zooms about the cursor, keeping the world point under the cursor invariant', () => {
    const { result } = renderHook(() => useEricWheelZoomTool());
    const setView = vi.fn();
    const ctx = makeCtx(
      { x: 0, y: 0, scale: 50 },
      setView,
      { x: 10, y: 5, width: 400, height: 300 } as Partial<DOMRect>,
    );
    const e = wheel({ deltaY: -100, clientX: 110, clientY: 105 });
    result.current.wheel!.onWheel!(e, ctx);
    const next = setView.mock.calls[0][0] as View;
    // anchor in canvas coords: (100, 100); world point = (100/50 + 0, 100/50 + 0) = (2, 2)
    // After zoom, screen point (100, 100) must still map to world (2, 2):
    expect(100 / next.scale + next.x).toBeCloseTo(2);
    expect(100 / next.scale + next.y).toBeCloseTo(2);
    expect(next.scale).toBeCloseTo(50 * 1.1);
  });

  it('clamps to eric-tuned min/max defaults (5 and 500)', () => {
    const { result } = renderHook(() => useEricWheelZoomTool());
    const setView = vi.fn();
    const ctx = makeCtx({ x: 0, y: 0, scale: 50 }, setView);
    result.current.wheel!.onWheel!(wheel({ deltaY: -10000 }), ctx);
    expect((setView.mock.calls[0][0] as View).scale).toBe(500);
    result.current.wheel!.onWheel!(wheel({ deltaY: 10000 }), ctx);
    expect((setView.mock.calls[1][0] as View).scale).toBe(5);
  });

  it('calls preventDefault when claiming', () => {
    const { result } = renderHook(() => useEricWheelZoomTool());
    const ctx = makeCtx({ x: 0, y: 0, scale: 50 }, vi.fn());
    const e = wheel({ deltaY: -100 });
    result.current.wheel!.onWheel!(e, ctx);
    expect(e.preventDefault).toHaveBeenCalled();
  });
});
