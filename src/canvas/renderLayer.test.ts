import { describe, it, expect, vi } from 'vitest';
import type { RenderLayer } from '@/canvas-kit';
import { runLayers } from '@/canvas-kit';

// Minimal mock for CanvasRenderingContext2D
function makeCtx(): CanvasRenderingContext2D {
  return {} as CanvasRenderingContext2D;
}

type TestData = { value: number };

describe('runLayers', () => {
  it('draws all visible layers in order', () => {
    const calls: string[] = [];
    const ctx = makeCtx();
    const data: TestData = { value: 1 };

    const layers: RenderLayer<TestData>[] = [
      { id: 'a', label: 'A', draw: () => calls.push('a') },
      { id: 'b', label: 'B', draw: () => calls.push('b') },
      { id: 'c', label: 'C', draw: () => calls.push('c') },
    ];

    runLayers(ctx, layers, data, {});

    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('skips layers toggled off in visibility map', () => {
    const calls: string[] = [];
    const ctx = makeCtx();
    const data: TestData = { value: 1 };

    const layers: RenderLayer<TestData>[] = [
      { id: 'a', label: 'A', draw: () => calls.push('a') },
      { id: 'b', label: 'B', draw: () => calls.push('b') },
      { id: 'c', label: 'C', draw: () => calls.push('c') },
    ];

    runLayers(ctx, layers, data, { b: false });

    expect(calls).toEqual(['a', 'c']);
  });

  it('respects defaultVisible=false', () => {
    const calls: string[] = [];
    const ctx = makeCtx();
    const data: TestData = { value: 1 };

    const layers: RenderLayer<TestData>[] = [
      { id: 'a', label: 'A', draw: () => calls.push('a') },
      { id: 'b', label: 'B', draw: () => calls.push('b'), defaultVisible: false },
    ];

    runLayers(ctx, layers, data, {});

    expect(calls).toEqual(['a']);
  });

  it('shows defaultVisible=false layer when visibility override is true', () => {
    const calls: string[] = [];
    const ctx = makeCtx();
    const data: TestData = { value: 1 };

    const layers: RenderLayer<TestData>[] = [
      { id: 'a', label: 'A', draw: () => calls.push('a') },
      { id: 'b', label: 'B', draw: () => calls.push('b'), defaultVisible: false },
    ];

    runLayers(ctx, layers, data, { b: true });

    expect(calls).toEqual(['a', 'b']);
  });

  it('never hides alwaysOn layers even when toggled off', () => {
    const calls: string[] = [];
    const ctx = makeCtx();
    const data: TestData = { value: 1 };

    const layers: RenderLayer<TestData>[] = [
      { id: 'a', label: 'A', draw: () => calls.push('a'), alwaysOn: true },
      { id: 'b', label: 'B', draw: () => calls.push('b') },
    ];

    runLayers(ctx, layers, data, { a: false, b: false });

    expect(calls).toEqual(['a']);
  });

  it('uses custom order when provided', () => {
    const calls: string[] = [];
    const ctx = makeCtx();
    const data: TestData = { value: 1 };

    const layers: RenderLayer<TestData>[] = [
      { id: 'a', label: 'A', draw: () => calls.push('a') },
      { id: 'b', label: 'B', draw: () => calls.push('b') },
      { id: 'c', label: 'C', draw: () => calls.push('c') },
    ];

    runLayers(ctx, layers, data, {}, ['c', 'a', 'b']);

    expect(calls).toEqual(['c', 'a', 'b']);
  });

  it('passes ctx and data to each draw call', () => {
    const ctx = makeCtx();
    const data: TestData = { value: 42 };
    const drawA = vi.fn();

    const layers: RenderLayer<TestData>[] = [
      { id: 'a', label: 'A', draw: drawA },
    ];

    runLayers(ctx, layers, data, {});

    expect(drawA).toHaveBeenCalledWith(ctx, data);
  });
});
