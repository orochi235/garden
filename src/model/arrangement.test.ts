import { describe, expect, it } from 'vitest';
import type { ParentBounds } from './arrangement';
import { computeSlots, defaultArrangement } from './arrangement';

const rectBounds: ParentBounds = { x: 0, y: 0, width: 4, length: 8, shape: 'rectangle' };
const circleBounds: ParentBounds = { x: 0, y: 0, width: 4, length: 4, shape: 'circle' };

describe('computeSlots', () => {
  describe('single', () => {
    it('returns one centered slot', () => {
      const slots = computeSlots({ type: 'single' }, rectBounds);
      expect(slots).toEqual([{ x: 2, y: 4 }]);
    });

    it('centers in circle bounds', () => {
      const slots = computeSlots({ type: 'single' }, circleBounds);
      expect(slots).toEqual([{ x: 2, y: 2 }]);
    });
  });

  describe('free', () => {
    it('returns no slots', () => {
      const slots = computeSlots({ type: 'free' }, rectBounds);
      expect(slots).toEqual([]);
    });
  });

  describe('rows', () => {
    it('generates slots in horizontal rows', () => {
      const arr = defaultArrangement('rows');
      const slots = computeSlots(arr, rectBounds);
      expect(slots.length).toBeGreaterThan(0);
      // All slots should be within bounds
      for (const s of slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(4);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(8);
      }
    });

    it('respects margin', () => {
      const arr = { type: 'rows' as const, spacingFt: 1, itemSpacingFt: 1, marginFt: 1 };
      const slots = computeSlots(arr, rectBounds);
      for (const s of slots) {
        expect(s.x).toBeGreaterThanOrEqual(1);
        expect(s.x).toBeLessThanOrEqual(3);
        expect(s.y).toBeGreaterThanOrEqual(1);
        expect(s.y).toBeLessThanOrEqual(7);
      }
    });

    it('clips to circle bounds', () => {
      const arr = defaultArrangement('rows');
      const slots = computeSlots(arr, circleBounds);
      const cx = 2, cy = 2, r = 2 - 0.25;
      for (const s of slots) {
        const dx = (s.x - cx) / r;
        const dy = (s.y - cy) / r;
        expect(dx * dx + dy * dy).toBeLessThanOrEqual(1.01);
      }
    });
  });

  describe('grid', () => {
    it('generates slots in a grid', () => {
      const arr = defaultArrangement('grid');
      const slots = computeSlots(arr, rectBounds);
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(4);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(8);
      }
    });

    it('produces more slots with smaller spacing', () => {
      const sparse = { type: 'grid' as const, spacingXFt: 2, spacingYFt: 2, marginFt: 0.25 };
      const dense = { type: 'grid' as const, spacingXFt: 1, spacingYFt: 1, marginFt: 0.25 };
      expect(computeSlots(dense, rectBounds).length).toBeGreaterThan(
        computeSlots(sparse, rectBounds).length,
      );
    });
  });

  describe('ring', () => {
    it('generates correct number of slots', () => {
      const arr = { type: 'ring' as const, count: 8, marginFt: 0.5, startAngleDeg: 0 };
      const slots = computeSlots(arr, circleBounds);
      expect(slots).toHaveLength(8);
    });

    it('returns no slots with count 0', () => {
      const arr = { type: 'ring' as const, count: 0, marginFt: 0.5, startAngleDeg: 0 };
      const slots = computeSlots(arr, circleBounds);
      expect(slots).toHaveLength(0);
    });

    it('places first slot at top when startAngle is 0', () => {
      const arr = { type: 'ring' as const, count: 4, marginFt: 0.5, startAngleDeg: 0 };
      const slots = computeSlots(arr, circleBounds);
      // First slot should be at top center
      expect(slots[0].x).toBeCloseTo(2, 5);
      expect(slots[0].y).toBeCloseTo(0.5, 5);
    });
  });
});
