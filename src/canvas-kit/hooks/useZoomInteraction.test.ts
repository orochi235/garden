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
