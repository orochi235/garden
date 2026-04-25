// src/drag-lab/strategies/slot-based.test.ts
import { describe, it, expect } from 'vitest';
import { slotBasedStrategy } from './slot-based';
import type { LabItem, Rect } from '../types';

const bounds: Rect = { x: 0, y: 0, width: 4, height: 4 };

function makeItem(overrides: Partial<LabItem> = {}): LabItem {
  return { id: '1', label: 'Test', radiusFt: 0.25, color: '#f00', x: 0, y: 0, ...overrides };
}

describe('slotBasedStrategy', () => {
  it('has name "Slot-based"', () => {
    expect(slotBasedStrategy.name).toBe('Slot-based');
  });

  it('default config uses rows arrangement', () => {
    const config = slotBasedStrategy.defaultConfig();
    expect(config.arrangementType).toBe('rows');
  });

  it('snaps item to nearest slot on drop', () => {
    const config = slotBasedStrategy.defaultConfig();
    const result = slotBasedStrategy.onDrop(bounds, 'rectangle', { x: 0.3, y: 0.3 }, makeItem(), [], config);
    expect(result.item.x).not.toBe(0.3);
    expect(result.item.y).not.toBe(0.3);
  });

  it('does not snap to an occupied slot', () => {
    const config = slotBasedStrategy.defaultConfig();
    const first = slotBasedStrategy.onDrop(bounds, 'rectangle', { x: 0.3, y: 0.3 }, makeItem({ id: 'a' }), [], config);
    const second = slotBasedStrategy.onDrop(bounds, 'rectangle', { x: 0.3, y: 0.3 }, makeItem({ id: 'b' }), [first.item], config);
    expect(second.item.x !== first.item.x || second.item.y !== first.item.y).toBe(true);
  });

  it('provides drag feedback with snap preview', () => {
    const config = slotBasedStrategy.defaultConfig();
    const feedback = slotBasedStrategy.onDragOver(bounds, 'rectangle', { x: 1, y: 1 }, [], config);
    expect(feedback).not.toBeNull();
  });

  it('config schema includes arrangementType dropdown', () => {
    const schema = slotBasedStrategy.configSchema();
    const typeField = schema.find((f) => f.key === 'arrangementType');
    expect(typeField).toBeDefined();
    expect(typeField!.type).toBe('dropdown');
  });
});
