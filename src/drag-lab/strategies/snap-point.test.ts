// src/drag-lab/strategies/snap-point.test.ts
import { describe, it, expect } from 'vitest';
import { snapPointStrategy } from './snap-point';
import type { LabItem, Rect } from '../types';

const bounds: Rect = { x: 0, y: 0, width: 4, height: 4 };

function makeItem(overrides: Partial<LabItem> = {}): LabItem {
  return { id: '1', label: 'Test', radiusFt: 0.25, color: '#f00', x: 0, y: 0, ...overrides };
}

describe('snapPointStrategy', () => {
  it('has name "Snap-point"', () => {
    expect(snapPointStrategy.name).toBe('Snap-point');
  });

  it('snaps to nearest point within threshold', () => {
    const config = { ...snapPointStrategy.defaultConfig(), pattern: 'grid', gridSpacing: 1, snapThreshold: 0.5 };
    const result = snapPointStrategy.onDrop(bounds, 'rectangle', { x: 0.6, y: 0.6 }, makeItem(), [], config);
    expect(Math.abs(result.item.x - 0.6)).toBeLessThanOrEqual(0.5);
  });

  it('drops at cursor when outside snap threshold', () => {
    const config = { ...snapPointStrategy.defaultConfig(), pattern: 'corners', snapThreshold: 0.1 };
    const result = snapPointStrategy.onDrop(bounds, 'rectangle', { x: 2, y: 2 }, makeItem(), [], config);
    expect(result.item.x).toBe(2);
    expect(result.item.y).toBe(2);
  });

  it('config schema has snapThreshold and pattern', () => {
    const schema = snapPointStrategy.configSchema();
    expect(schema.find((f) => f.key === 'snapThreshold')).toBeDefined();
    expect(schema.find((f) => f.key === 'pattern')).toBeDefined();
  });
});
