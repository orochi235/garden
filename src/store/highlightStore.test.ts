import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetHighlightStore, useHighlightStore } from './highlightStore';

describe('highlightStore', () => {
  afterEach(() => {
    resetHighlightStore();
    vi.useRealTimers();
  });

  it('flash → opacity ramps via fadeIn → hold → fadeOut → 0', () => {
    vi.useFakeTimers();
    const t0 = 1000;
    vi.setSystemTime(t0);
    // Spy performance.now via a stub since vitest fake timers do not control it.
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(t0);

    const s = useHighlightStore.getState();
    s.flash('a', { fadeInMs: 100, holdMs: 200, fadeOutMs: 100 });

    nowSpy.mockReturnValue(t0 + 50);
    expect(useHighlightStore.getState().computeOpacity('a')).toBeCloseTo(0.5, 5);

    nowSpy.mockReturnValue(t0 + 200);
    expect(useHighlightStore.getState().computeOpacity('a')).toBe(1);

    nowSpy.mockReturnValue(t0 + 350);
    expect(useHighlightStore.getState().computeOpacity('a')).toBeCloseTo(0.5, 5);

    nowSpy.mockReturnValue(t0 + 500);
    expect(useHighlightStore.getState().computeOpacity('a')).toBe(0);

    nowSpy.mockRestore();
  });

  it('hover ids force opacity = 1 regardless of flash state', () => {
    const s = useHighlightStore.getState();
    s.setHover(['x']);
    expect(useHighlightStore.getState().computeOpacity('x')).toBe(1);
    s.setHover([]);
    expect(useHighlightStore.getState().computeOpacity('x')).toBe(0);
  });

  it('clearFlash removes an in-flight flash', () => {
    const s = useHighlightStore.getState();
    s.flash('y');
    expect(useHighlightStore.getState().flashes.has('y')).toBe(true);
    s.clearFlash('y');
    expect(useHighlightStore.getState().flashes.has('y')).toBe(false);
  });
});
