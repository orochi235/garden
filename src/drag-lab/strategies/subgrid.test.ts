// src/drag-lab/strategies/subgrid.test.ts
import { describe, it, expect } from 'vitest';
import { subgridStrategy } from './subgrid';
import type { LabItem, Rect } from '../types';

const bounds: Rect = { x: 0, y: 0, width: 4, height: 4 };

function makeItem(overrides: Partial<LabItem> = {}): LabItem {
  return { id: '1', label: 'Test', radiusFt: 0.25, color: '#f00', x: 0, y: 0, ...overrides };
}

describe('subgridStrategy', () => {
  it('has name "Subgrid"', () => {
    expect(subgridStrategy.name).toBe('Subgrid');
  });

  it('snaps item to cell center on drop', () => {
    const config = { cols: 4, rows: 4, gapFt: 0 };
    const result = subgridStrategy.onDrop(bounds, 'rectangle', { x: 0.3, y: 0.3 }, makeItem(), [], config);
    expect(result.item.x).toBe(0.5);
    expect(result.item.y).toBe(0.5);
  });

  it('does not place two items in the same cell', () => {
    const config = { cols: 4, rows: 4, gapFt: 0 };
    const first = subgridStrategy.onDrop(bounds, 'rectangle', { x: 0.3, y: 0.3 }, makeItem({ id: 'a' }), [], config);
    const second = subgridStrategy.onDrop(bounds, 'rectangle', { x: 0.3, y: 0.3 }, makeItem({ id: 'b' }), [first.item], config);
    expect(second.item.x !== first.item.x || second.item.y !== first.item.y).toBe(true);
  });

  it('provides drag feedback', () => {
    const config = subgridStrategy.defaultConfig();
    const feedback = subgridStrategy.onDragOver(bounds, 'rectangle', { x: 1, y: 1 }, [], config);
    expect(feedback).not.toBeNull();
  });

  it('config schema has cols and rows sliders', () => {
    const schema = subgridStrategy.configSchema();
    expect(schema.find((f) => f.key === 'cols')).toBeDefined();
    expect(schema.find((f) => f.key === 'rows')).toBeDefined();
  });
});
