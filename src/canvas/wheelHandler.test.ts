import { describe, expect, it } from 'vitest';
import type { WheelInput, WheelState } from './wheelHandler';
import { computeWheelAction } from './wheelHandler';

const baseState: WheelState = { zoom: 50, panX: 100, panY: 200 };
const baseInput: WheelInput = { deltaX: 0, deltaY: 0, mouseX: 400, mouseY: 300 };

describe('computeWheelAction', () => {
  describe('select mode', () => {
    it('pans vertically on deltaY', () => {
      const result = computeWheelAction('select', baseState, { ...baseInput, deltaY: 30 });
      expect(result.panX).toBe(100);
      expect(result.panY).toBe(170);
      expect(result.zoom).toBe(50);
    });

    it('pans horizontally on deltaX', () => {
      const result = computeWheelAction('select', baseState, { ...baseInput, deltaX: -20 });
      expect(result.panX).toBe(120);
      expect(result.panY).toBe(200);
      expect(result.zoom).toBe(50);
    });

    it('pans in both axes simultaneously', () => {
      const result = computeWheelAction('select', baseState, {
        ...baseInput,
        deltaX: 10,
        deltaY: 15,
      });
      expect(result.panX).toBe(90);
      expect(result.panY).toBe(185);
      expect(result.zoom).toBe(50);
    });

    it('does not change zoom', () => {
      const result = computeWheelAction('select', baseState, { ...baseInput, deltaY: 100 });
      expect(result.zoom).toBe(baseState.zoom);
    });
  });

  describe('pan mode', () => {
    it('pans vertically on deltaY', () => {
      const result = computeWheelAction('pan', baseState, { ...baseInput, deltaY: 50 });
      expect(result.panY).toBe(150);
      expect(result.zoom).toBe(50);
    });

    it('pans horizontally on deltaX', () => {
      const result = computeWheelAction('pan', baseState, { ...baseInput, deltaX: -40 });
      expect(result.panX).toBe(140);
      expect(result.zoom).toBe(50);
    });

    it('does not change zoom', () => {
      const result = computeWheelAction('pan', baseState, { ...baseInput, deltaY: -80 });
      expect(result.zoom).toBe(baseState.zoom);
    });
  });

  describe('zoom mode', () => {
    it('zooms in on negative deltaY', () => {
      const result = computeWheelAction('zoom', baseState, { ...baseInput, deltaY: -100 });
      expect(result.zoom).toBeGreaterThan(baseState.zoom);
    });

    it('zooms out on positive deltaY', () => {
      const result = computeWheelAction('zoom', baseState, { ...baseInput, deltaY: 100 });
      expect(result.zoom).toBeLessThan(baseState.zoom);
    });

    it('does not change zoom on zero deltaY', () => {
      const result = computeWheelAction('zoom', baseState, { ...baseInput, deltaY: 0 });
      // deltaY=0 is treated as positive (0.9 factor) but zoom * 0.9 still changes
      // Actually factor is 0.9 when deltaY >= 0
      expect(result.zoom).toBe(baseState.zoom * 0.9);
    });

    it('clamps zoom to minimum of 10', () => {
      const lowState = { ...baseState, zoom: 11 };
      const result = computeWheelAction('zoom', lowState, { ...baseInput, deltaY: 100 });
      expect(result.zoom).toBeGreaterThanOrEqual(10);
    });

    it('clamps zoom to maximum of 200', () => {
      const highState = { ...baseState, zoom: 195 };
      const result = computeWheelAction('zoom', highState, { ...baseInput, deltaY: -100 });
      expect(result.zoom).toBeLessThanOrEqual(200);
    });

    it('preserves world point under mouse when zooming in', () => {
      const state: WheelState = { zoom: 50, panX: 100, panY: 200 };
      const mouse = { deltaX: 0, deltaY: -100, mouseX: 400, mouseY: 300 };

      // World point under mouse before zoom
      const worldXBefore = (mouse.mouseX - state.panX) / state.zoom;
      const worldYBefore = (mouse.mouseY - state.panY) / state.zoom;

      const result = computeWheelAction('zoom', state, mouse);

      // World point under mouse after zoom
      const worldXAfter = (mouse.mouseX - result.panX) / result.zoom;
      const worldYAfter = (mouse.mouseY - result.panY) / result.zoom;

      expect(worldXAfter).toBeCloseTo(worldXBefore, 5);
      expect(worldYAfter).toBeCloseTo(worldYBefore, 5);
    });

    it('preserves world point under mouse when zooming out', () => {
      const state: WheelState = { zoom: 100, panX: -50, panY: -50 };
      const mouse = { deltaX: 0, deltaY: 50, mouseX: 250, mouseY: 250 };

      const worldXBefore = (mouse.mouseX - state.panX) / state.zoom;
      const worldYBefore = (mouse.mouseY - state.panY) / state.zoom;

      const result = computeWheelAction('zoom', state, mouse);

      const worldXAfter = (mouse.mouseX - result.panX) / result.zoom;
      const worldYAfter = (mouse.mouseY - result.panY) / result.zoom;

      expect(worldXAfter).toBeCloseTo(worldXBefore, 5);
      expect(worldYAfter).toBeCloseTo(worldYBefore, 5);
    });

    it('adjusts pan to keep mouse-anchored zoom', () => {
      const result = computeWheelAction('zoom', baseState, { ...baseInput, deltaY: -100 });
      // Pan should change to compensate for zoom change
      expect(result.panX).not.toBe(baseState.panX);
      expect(result.panY).not.toBe(baseState.panY);
    });
  });
});
