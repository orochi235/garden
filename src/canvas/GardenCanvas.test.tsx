import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GardenCanvas } from './GardenCanvas';

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

describe('GardenCanvas', () => {
  it('mounts without console errors', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<GardenCanvas />);
    unmount();
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
