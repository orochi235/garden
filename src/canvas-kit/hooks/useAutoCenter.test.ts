import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { computeFitView, useAutoCenter } from './useAutoCenter';

describe('computeFitView', () => {
  it('fits content with default padRatio 0.85, centered', () => {
    // viewport 200x200, content 10x10 -> avail 170 -> zoom 17 -> contentPx 170
    // pan = (200 - 170) / 2 = 15
    const r = computeFitView(200, 200, 10, 10);
    expect(r.zoom).toBe(17);
    expect(r.panX).toBe(15);
    expect(r.panY).toBe(15);
  });

  it('uses custom padRatio', () => {
    // 100x100, padRatio 0.5 -> avail 50; content 10x10 -> zoom 5; pan = (100-50)/2 = 25
    const r = computeFitView(100, 100, 10, 10, 0.5);
    expect(r.zoom).toBe(5);
    expect(r.panX).toBe(25);
    expect(r.panY).toBe(25);
  });

  it('handles non-square content (uses smaller axis ratio)', () => {
    // 100x100, padRatio 1, content 20x10 -> zoom = min(5, 10) = 5
    // contentPx = 100 x 50 -> panX 0, panY 25
    const r = computeFitView(100, 100, 20, 10, 1);
    expect(r.zoom).toBe(5);
    expect(r.panX).toBe(0);
    expect(r.panY).toBe(25);
  });
});

describe('useAutoCenter', () => {
  it('does nothing while viewport is zero-sized', () => {
    const setZoom = vi.fn();
    const setPan = vi.fn();
    renderHook(() => useAutoCenter(0, 0, 10, 10, setZoom, setPan));
    expect(setZoom).not.toHaveBeenCalled();
    expect(setPan).not.toHaveBeenCalled();
  });

  it('centers exactly once when viewport first has size', () => {
    const setZoom = vi.fn();
    const setPan = vi.fn();
    const { rerender } = renderHook(
      ({ w, h }: { w: number; h: number }) => useAutoCenter(w, h, 10, 10, setZoom, setPan),
      { initialProps: { w: 0, h: 0 } },
    );
    expect(setZoom).not.toHaveBeenCalled();
    rerender({ w: 200, h: 200 });
    expect(setZoom).toHaveBeenCalledTimes(1);
    expect(setPan).toHaveBeenCalledTimes(1);
    // Subsequent size change does not re-center
    rerender({ w: 400, h: 400 });
    expect(setZoom).toHaveBeenCalledTimes(1);
    expect(setPan).toHaveBeenCalledTimes(1);
  });

  it('passes computed fit values to setters', () => {
    const setZoom = vi.fn();
    const setPan = vi.fn();
    renderHook(() => useAutoCenter(200, 200, 10, 10, setZoom, setPan));
    // Default padRatio 0.85 -> zoom 17, pan 15
    expect(setZoom).toHaveBeenCalledWith(17);
    expect(setPan).toHaveBeenCalledWith(15, 15);
  });
});
