import { describe, expect, it } from 'vitest';
import { fitToBounds, fitZoom } from './fitToBounds';

describe('fitZoom', () => {
  it('returns the smaller of width and height ratios', () => {
    // wide viewport, square content -> height is the constraint
    expect(fitZoom(400, 100, 10, 10)).toBe(10);
    // tall viewport, square content -> width is the constraint
    expect(fitZoom(100, 400, 10, 10)).toBe(10);
  });

  it('respects clamp.max', () => {
    expect(fitZoom(1000, 1000, 10, 10, { max: 50 })).toBe(50);
  });

  it('respects clamp.min', () => {
    expect(fitZoom(10, 10, 100, 100, { min: 0.5 })).toBe(0.5);
  });

  it('returns raw ratio when within clamp range', () => {
    expect(fitZoom(100, 100, 10, 10, { min: 1, max: 100 })).toBe(10);
  });
});

describe('fitToBounds', () => {
  it('centers content with no padding', () => {
    const r = fitToBounds(200, 200, 10, 10);
    expect(r.zoom).toBe(20);
    expect(r.panX).toBe(0);
    expect(r.panY).toBe(0);
  });

  it('centers content within larger viewport', () => {
    // viewport 200x100, content 10x10 -> zoom = min(200/10, 100/10) = 10
    // contentPx = 100x100; panX = (200-100)/2 = 50, panY = 0
    const r = fitToBounds(200, 100, 10, 10);
    expect(r.zoom).toBe(10);
    expect(r.panX).toBe(50);
    expect(r.panY).toBe(0);
  });

  it('subtracts padding from each side when computing zoom', () => {
    // 200x200 viewport with 10px padding -> avail 180x180; content 10x10 -> zoom 18
    // contentPx 180; pan = (200-180)/2 = 10
    const r = fitToBounds(200, 200, 10, 10, 10);
    expect(r.zoom).toBe(18);
    expect(r.panX).toBe(10);
    expect(r.panY).toBe(10);
  });

  it('clamps avail dimensions to >= 1 when padding exceeds viewport', () => {
    const r = fitToBounds(10, 10, 10, 10, 100);
    // avail = max(1, 10-200) = 1 -> zoom = 1/10 = 0.1
    expect(r.zoom).toBeCloseTo(0.1, 5);
  });

  it('honors clamp on returned zoom', () => {
    const r = fitToBounds(1000, 1000, 10, 10, 0, { max: 5 });
    expect(r.zoom).toBe(5);
    // contentPx = 50, pan = (1000-50)/2 = 475
    expect(r.panX).toBe(475);
    expect(r.panY).toBe(475);
  });
});
