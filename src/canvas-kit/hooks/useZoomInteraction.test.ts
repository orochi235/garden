import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useZoomInteraction } from './useZoomInteraction';

function setup(overrides: Partial<Parameters<typeof useZoomInteraction>[0]> = {}) {
  const setZoom = vi.fn();
  const setPan = vi.fn();
  const opts = {
    zoom: 1,
    setZoom,
    pan: { x: 0, y: 0 },
    setPan,
    viewport: { width: 400, height: 300 },
    ...overrides,
  };
  const { result } = renderHook(() => useZoomInteraction(opts));
  return { result, setZoom, setPan, opts };
}

describe('useZoomInteraction — clamp policy', () => {
  it('clamps zoomTo above max', () => {
    const { result, setZoom } = setup({ zoom: 1, max: 10 });
    act(() => result.current.zoomTo(50));
    expect(setZoom).toHaveBeenCalledWith(10);
  });

  it('clamps zoomTo below min', () => {
    const { result, setZoom } = setup({ zoom: 1, min: 0.1 });
    act(() => result.current.zoomTo(0.001));
    expect(setZoom).toHaveBeenCalledWith(0.1);
  });

  it('zoomBy multiplies current zoom and clamps', () => {
    const { result, setZoom } = setup({ zoom: 2, max: 10 });
    act(() => result.current.zoomBy(100));
    expect(setZoom).toHaveBeenCalledWith(10);
  });

  it('locks zoom when min === max', () => {
    const { result, setZoom, setPan } = setup({ zoom: 1, min: 1, max: 1 });
    act(() => result.current.zoomTo(5));
    expect(setZoom).toHaveBeenCalledWith(1);
    // pan also stays put (k = 1)
    expect(setPan).toHaveBeenCalledWith({ x: 0, y: 0 });
  });

  it('uses default range [0.1, 10] when min/max omitted', () => {
    const { result, setZoom } = setup({ zoom: 1 });
    act(() => result.current.zoomTo(1000));
    expect(setZoom).toHaveBeenCalledWith(10);
    setZoom.mockClear();
    act(() => result.current.zoomTo(0.0001));
    expect(setZoom).toHaveBeenCalledWith(0.1);
  });
});

describe('useZoomInteraction — focal-point invariant', () => {
  it('zoomTo with focal keeps the world point under the focal stationary', () => {
    const zoom = 2;
    const pan = { x: 50, y: 30 };
    const focal = { x: 200, y: 150 };
    // World point under focal before:
    const wxBefore = (focal.x - pan.x) / zoom;
    const wyBefore = (focal.y - pan.y) / zoom;

    const setZoom = vi.fn();
    const setPan = vi.fn();
    const { result } = renderHook(() =>
      useZoomInteraction({
        zoom,
        setZoom,
        pan,
        setPan,
        viewport: { width: 400, height: 300 },
      }),
    );
    act(() => result.current.zoomTo(4, focal));

    const newZoom = setZoom.mock.calls[0][0] as number;
    const newPan = setPan.mock.calls[0][0] as { x: number; y: number };
    const wxAfter = (focal.x - newPan.x) / newZoom;
    const wyAfter = (focal.y - newPan.y) / newZoom;
    expect(wxAfter).toBeCloseTo(wxBefore, 5);
    expect(wyAfter).toBeCloseTo(wyBefore, 5);
  });

  it('zoomTo without focal uses viewport center', () => {
    const setZoom = vi.fn();
    const setPan = vi.fn();
    const viewport = { width: 400, height: 300 };
    const zoom = 1;
    const pan = { x: 0, y: 0 };
    const { result } = renderHook(() =>
      useZoomInteraction({ zoom, setZoom, pan, setPan, viewport }),
    );
    act(() => result.current.zoomTo(2));
    const newZoom = setZoom.mock.calls[0][0] as number;
    const newPan = setPan.mock.calls[0][0] as { x: number; y: number };
    const focal = { x: viewport.width / 2, y: viewport.height / 2 };
    expect((focal.x - newPan.x) / newZoom).toBeCloseTo((focal.x - pan.x) / zoom, 5);
    expect((focal.y - newPan.y) / newZoom).toBeCloseTo((focal.y - pan.y) / zoom, 5);
  });
});

function makeWheelEvent(over: Partial<{
  deltaY: number; clientX: number; clientY: number;
  ctrlKey: boolean; metaKey: boolean; shiftKey: boolean;
  rect: { left: number; top: number };
}> = {}) {
  const rect = over.rect ?? { left: 0, top: 0 };
  const preventDefault = vi.fn();
  return {
    deltaY: over.deltaY ?? -100,
    clientX: over.clientX ?? 100,
    clientY: over.clientY ?? 80,
    ctrlKey: over.ctrlKey ?? false,
    metaKey: over.metaKey ?? false,
    shiftKey: over.shiftKey ?? false,
    preventDefault,
    currentTarget: {
      getBoundingClientRect: () => ({ left: rect.left, top: rect.top, right: 0, bottom: 0, width: 0, height: 0, x: rect.left, y: rect.top, toJSON: () => ({}) }),
    } as unknown as Element,
  } as unknown as WheelEvent;
}

describe('useZoomInteraction — wheel', () => {
  it('bare wheel zooms in on negative deltaY (default mode)', () => {
    const { result, setZoom } = setup({ zoom: 1 });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -100 })));
    expect(setZoom).toHaveBeenCalled();
    const next = setZoom.mock.calls[0][0] as number;
    expect(next).toBeGreaterThan(1);
  });

  it('bare wheel zooms out on positive deltaY (default mode)', () => {
    const { result, setZoom } = setup({ zoom: 2 });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: 100 })));
    const next = setZoom.mock.calls[0][0] as number;
    expect(next).toBeLessThan(2);
  });

  it('bare wheel no-ops when wheelRequiresModifier is true', () => {
    const { result, setZoom } = setup({ zoom: 1, wheelRequiresModifier: true });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -100 })));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('ctrl+wheel zooms even when wheelRequiresModifier is true', () => {
    const { result, setZoom } = setup({ zoom: 1, wheelRequiresModifier: true });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -100, ctrlKey: true })));
    expect(setZoom).toHaveBeenCalled();
  });

  it('ctrl+wheel (pinch) zooms even in default mode', () => {
    const { result, setZoom } = setup({ zoom: 1 });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -10, ctrlKey: true })));
    expect(setZoom).toHaveBeenCalled();
  });

  it('sources.wheel=false disables non-pinch wheel', () => {
    const { result, setZoom } = setup({ zoom: 1, sources: { wheel: false } });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -100 })));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('sources.pinch=false disables ctrlKey wheel', () => {
    const { result, setZoom } = setup({
      zoom: 1,
      sources: { wheel: true, pinch: false },
    });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -10, ctrlKey: true })));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('focal is event coords minus canvas bounding rect', () => {
    const { result, setZoom, setPan } = setup({ zoom: 1, pan: { x: 0, y: 0 } });
    act(() => result.current.onWheel(makeWheelEvent({
      deltaY: -100, clientX: 250, clientY: 150,
      rect: { left: 50, top: 50 },
    })));
    // focal = (200, 100); world point under focal at zoom=1, pan=0 is (200, 100).
    // After zoom-in, that world point must still sit at screen (200, 100).
    const newZoom = setZoom.mock.calls[0][0] as number;
    const newPan = setPan.mock.calls[0][0] as { x: number; y: number };
    expect((200 - newPan.x) / newZoom).toBeCloseTo(200, 5);
    expect((100 - newPan.y) / newZoom).toBeCloseTo(100, 5);
  });

  it('calls preventDefault on pinch (ctrlKey wheel)', () => {
    const { result } = setup({ zoom: 1 });
    const e = makeWheelEvent({ deltaY: -10, ctrlKey: true });
    act(() => result.current.onWheel(e));
    expect(e.preventDefault).toHaveBeenCalled();
  });
});
