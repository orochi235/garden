import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '../store/uiStore';
import { LayerSelector } from './LayerSelector';

/**
 * Regression: switching app mode swaps the widget's layer set (garden's full
 * list ⇄ the nursery's two) while a tile animation is in flight. The tween read
 * `to[i]` for every tile of the OLD set, so the first frame after the switch
 * threw `Cannot read properties of undefined (reading 'y')` — and, being inside
 * a requestAnimationFrame loop, it threw on every subsequent frame too. One
 * click on the nursery-mode button was enough to trigger it.
 */
describe('LayerSelector across an app-mode switch', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw when the layer set shrinks mid-animation', () => {
    // Drive rAF by hand so the tween frames run inside the assertion window.
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    const onError = vi.fn();
    window.addEventListener('error', onError);

    render(<LayerSelector />);

    act(() => {
      // Start a tween in garden mode (full layer set), then switch to nursery
      // (two layers) before it finishes.
      useUiStore.getState().setActiveLayer('zones', true);
    });
    act(() => {
      useUiStore.getState().setAppMode('nursery');
    });

    // Run whatever frames are pending; none of them may throw.
    expect(() => {
      act(() => {
        for (const frame of frames.splice(0)) frame(performance.now() + 8);
      });
    }).not.toThrow();

    window.removeEventListener('error', onError);
  });
});
