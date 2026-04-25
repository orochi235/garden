import { describe, it, expect } from 'vitest';
import { freeFormStrategy } from './free-form';
import type { LabItem, Rect } from '../types';

const bounds: Rect = { x: 0, y: 0, width: 4, height: 4 };

function makeItem(x = 0, y = 0): LabItem {
  return { id: '1', label: 'Test', radiusFt: 0.25, color: '#f00', x, y };
}

describe('freeFormStrategy', () => {
  it('has name "Free-form"', () => {
    expect(freeFormStrategy.name).toBe('Free-form');
  });

  it('drops item at exact cursor position', () => {
    const result = freeFormStrategy.onDrop(bounds, 'rectangle', { x: 1.5, y: 2.3 }, makeItem(), [], {});
    expect(result.item.x).toBe(1.5);
    expect(result.item.y).toBe(2.3);
  });

  it('returns no drag feedback', () => {
    const feedback = freeFormStrategy.onDragOver(bounds, 'rectangle', { x: 1, y: 1 }, [], {});
    expect(feedback).toBeNull();
  });

  it('has empty config schema', () => {
    expect(freeFormStrategy.configSchema()).toEqual([]);
    expect(freeFormStrategy.defaultConfig()).toEqual({});
  });
});
