import { describe, expect, it } from 'vitest';
import type { WheelInput, WheelState } from './wheelHandler';
import { computeWheelAction } from './wheelHandler';

const baseState: WheelState = { zoom: 50, panX: 100, panY: 200 };
const baseInput: WheelInput = { deltaX: 0, deltaY: 0, mouseX: 400, mouseY: 300 };

describe('computeWheelAction', () => {
  it('zooms in on negative deltaY', () => {
    const result = computeWheelAction('select', baseState, { ...baseInput, deltaY: -100 });
    expect(result.zoom).toBeGreaterThan(baseState.zoom);
  });

  it('zooms out on positive deltaY', () => {
    const result = computeWheelAction('select', baseState, { ...baseInput, deltaY: 100 });
    expect(result.zoom).toBeLessThan(baseState.zoom);
  });

  it('clamps zoom to minimum of 10', () => {
    const lowState = { ...baseState, zoom: 11 };
    const result = computeWheelAction('select', lowState, { ...baseInput, deltaY: 100 });
    expect(result.zoom).toBeGreaterThanOrEqual(10);
  });

  it('clamps zoom to maximum of 200', () => {
    const highState = { ...baseState, zoom: 195 };
    const result = computeWheelAction('select', highState, { ...baseInput, deltaY: -100 });
    expect(result.zoom).toBeLessThanOrEqual(200);
  });

  it('preserves world point under mouse when zooming in', () => {
    const state: WheelState = { zoom: 50, panX: 100, panY: 200 };
    const mouse: WheelInput = { deltaX: 0, deltaY: -100, mouseX: 400, mouseY: 300 };

    const worldXBefore = (mouse.mouseX - state.panX) / state.zoom;
    const worldYBefore = (mouse.mouseY - state.panY) / state.zoom;

    const result = computeWheelAction('select', state, mouse);

    const worldXAfter = (mouse.mouseX - result.panX) / result.zoom;
    const worldYAfter = (mouse.mouseY - result.panY) / result.zoom;

    expect(worldXAfter).toBeCloseTo(worldXBefore, 5);
    expect(worldYAfter).toBeCloseTo(worldYBefore, 5);
  });

  it('preserves world point under mouse when zooming out', () => {
    const state: WheelState = { zoom: 100, panX: -50, panY: -50 };
    const mouse: WheelInput = { deltaX: 0, deltaY: 50, mouseX: 250, mouseY: 250 };

    const worldXBefore = (mouse.mouseX - state.panX) / state.zoom;
    const worldYBefore = (mouse.mouseY - state.panY) / state.zoom;

    const result = computeWheelAction('select', state, mouse);

    const worldXAfter = (mouse.mouseX - result.panX) / result.zoom;
    const worldYAfter = (mouse.mouseY - result.panY) / result.zoom;

    expect(worldXAfter).toBeCloseTo(worldXBefore, 5);
    expect(worldYAfter).toBeCloseTo(worldYBefore, 5);
  });

  it('zooms regardless of mode', () => {
    for (const mode of ['select', 'pan', 'zoom', 'draw'] as const) {
      const result = computeWheelAction(mode, baseState, { ...baseInput, deltaY: -100 });
      expect(result.zoom).toBeGreaterThan(baseState.zoom);
    }
  });

  describe('shift+wheel scrolls horizontally', () => {
    it('scrolls left on positive deltaY', () => {
      const result = computeWheelAction('select', baseState, { ...baseInput, deltaY: 30, shiftKey: true });
      expect(result.panX).toBe(70);
      expect(result.panY).toBe(200);
      expect(result.zoom).toBe(50);
    });

    it('scrolls right on negative deltaY', () => {
      const result = computeWheelAction('select', baseState, { ...baseInput, deltaY: -30, shiftKey: true });
      expect(result.panX).toBe(130);
      expect(result.panY).toBe(200);
      expect(result.zoom).toBe(50);
    });
  });

  describe('cmd+wheel scrolls vertically', () => {
    it('scrolls up on positive deltaY', () => {
      const result = computeWheelAction('select', baseState, { ...baseInput, deltaY: 30, metaKey: true });
      expect(result.panX).toBe(100);
      expect(result.panY).toBe(170);
      expect(result.zoom).toBe(50);
    });

    it('scrolls down on negative deltaY', () => {
      const result = computeWheelAction('select', baseState, { ...baseInput, deltaY: -30, metaKey: true });
      expect(result.panX).toBe(100);
      expect(result.panY).toBe(230);
      expect(result.zoom).toBe(50);
    });
  });
});
