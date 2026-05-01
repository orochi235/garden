import { describe, expect, it } from 'vitest';
import { roundToCell, screenToWorld, worldToScreen } from './grid';

describe('roundToCell', () => {
  it('snaps to nearest grid cell', () => {
    expect(roundToCell(2.3, 1)).toBe(2);
    expect(roundToCell(2.7, 1)).toBe(3);
    expect(roundToCell(2.5, 1)).toBe(3);
  });

  it('works with non-1 grid sizes', () => {
    expect(roundToCell(1.3, 0.5)).toBe(1.5);
    expect(roundToCell(1.1, 0.5)).toBe(1);
  });

  it('handles zero and negative', () => {
    expect(roundToCell(0, 1)).toBe(0);
    expect(roundToCell(-0.3, 1)).toBe(0);
    expect(roundToCell(-0.7, 1)).toBe(-1);
  });
});

describe('worldToScreen / screenToWorld', () => {
  const view = { panX: 10, panY: 20, zoom: 2 };

  it('converts world to screen coordinates', () => {
    const [sx, sy] = worldToScreen(5, 3, view);
    expect(sx).toBe(10 + 5 * 2);
    expect(sy).toBe(20 + 3 * 2);
  });

  it('converts screen to world coordinates', () => {
    const [wx, wy] = screenToWorld(20, 26, view);
    expect(wx).toBe(5);
    expect(wy).toBe(3);
  });

  it('roundtrips correctly', () => {
    const [sx, sy] = worldToScreen(7, 11, view);
    const [wx, wy] = screenToWorld(sx, sy, view);
    expect(wx).toBeCloseTo(7);
    expect(wy).toBeCloseTo(11);
  });
});
