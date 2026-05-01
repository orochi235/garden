import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePanInteraction } from './usePanInteraction';

function makeMouseEvent(clientX: number, clientY: number) {
  return { clientX, clientY } as React.MouseEvent;
}

describe('usePanInteraction', () => {
  it('start captures the active viewport setters and origin', () => {
    const setPan = vi.fn();
    const getActive = vi.fn(() => ({ x: 100, y: 200, setPan }));
    const { result } = renderHook(() => usePanInteraction(getActive));
    act(() => result.current.start(makeMouseEvent(10, 20)));
    expect(getActive).toHaveBeenCalledTimes(1);
    expect(result.current.isPanning.current).toBe(true);
  });

  it('move applies deltas to the captured panX/panY', () => {
    const setPan = vi.fn();
    const { result } = renderHook(() =>
      usePanInteraction(() => ({ x: 100, y: 200, setPan })),
    );
    act(() => result.current.start(makeMouseEvent(10, 20)));
    let returned = false;
    act(() => { returned = result.current.move(makeMouseEvent(15, 25)); });
    expect(returned).toBe(true);
    // dx=5, dy=5 -> pan(105, 205)
    expect(setPan).toHaveBeenCalledWith(105, 205);
  });

  it('move returns false when not panning', () => {
    const { result } = renderHook(() =>
      usePanInteraction(() => ({ x: 0, y: 0, setPan: () => {} })),
    );
    let returned = true;
    act(() => { returned = result.current.move(makeMouseEvent(10, 10)); });
    expect(returned).toBe(false);
  });

  it('end clears the panning flag; subsequent move is a no-op', () => {
    const setPan = vi.fn();
    const { result } = renderHook(() =>
      usePanInteraction(() => ({ x: 0, y: 0, setPan })),
    );
    act(() => result.current.start(makeMouseEvent(0, 0)));
    act(() => result.current.end());
    expect(result.current.isPanning.current).toBe(false);
    setPan.mockClear();
    act(() => { result.current.move(makeMouseEvent(50, 50)); });
    expect(setPan).not.toHaveBeenCalled();
  });

  it('captures setPan at start time even if getActive return changes later', () => {
    const setPanA = vi.fn();
    const setPanB = vi.fn();
    let active = { x: 0, y: 0, setPan: setPanA };
    const { result } = renderHook(() => usePanInteraction(() => active));
    act(() => result.current.start(makeMouseEvent(0, 0)));
    // Swap active viewport mid-gesture
    active = { x: 999, y: 999, setPan: setPanB };
    act(() => { result.current.move(makeMouseEvent(10, 10)); });
    // The captured setPanA should have been called, not setPanB
    expect(setPanA).toHaveBeenCalledWith(10, 10);
    expect(setPanB).not.toHaveBeenCalled();
  });
});
