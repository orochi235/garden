import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CanvasNewPrototype } from './CanvasNewPrototype';

beforeAll(() => {
  // jsdom lacks ResizeObserver; useCanvasSize needs it. Stub minimally.
  if (typeof ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('CanvasNewPrototype', () => {
  it('mounts without console errors', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<CanvasNewPrototype />);
    unmount();
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
