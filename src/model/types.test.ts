import { describe, it, expect } from 'vitest';
import { createGarden, createStructure, createZone, createPlanting } from './types';

describe('factory functions', () => {
  it('createGarden returns valid defaults', () => {
    const g = createGarden({ name: 'Test', widthFt: 20, heightFt: 15 });
    expect(g.id).toBeTruthy();
    expect(g.version).toBe(1);
    expect(g.name).toBe('Test');
    expect(g.widthFt).toBe(20);
    expect(g.heightFt).toBe(15);
    expect(g.gridCellSizeFt).toBe(1);
    expect(g.displayUnit).toBe('ft');
    expect(g.blueprint).toBeNull();
    expect(g.structures).toEqual([]);
    expect(g.zones).toEqual([]);
    expect(g.plantings).toEqual([]);
  });

  it('createStructure returns valid defaults', () => {
    const s = createStructure({ type: 'raised-bed', x: 2, y: 3, width: 4, height: 8 });
    expect(s.id).toBeTruthy();
    expect(s.type).toBe('raised-bed');
    expect(s.x).toBe(2);
    expect(s.y).toBe(3);
    expect(s.width).toBe(4);
    expect(s.height).toBe(8);
    expect(s.rotation).toBe(0);
    expect(s.color).toBeTruthy();
    expect(s.label).toBe('raised-bed');
    expect(s.zIndex).toBe(0);
    expect(s.parentId).toBeNull();
    expect(s.snapToGrid).toBe(true);
  });

  it('createZone returns valid defaults', () => {
    const z = createZone({ x: 1, y: 1, width: 3, height: 3 });
    expect(z.id).toBeTruthy();
    expect(z.x).toBe(1);
    expect(z.width).toBe(3);
    expect(z.zIndex).toBe(0);
    expect(z.parentId).toBeNull();
    expect(z.soilType).toBeNull();
    expect(z.sunExposure).toBeNull();
  });

  it('createPlanting returns valid defaults', () => {
    const p = createPlanting({ zoneId: 'zone-1', x: 0.5, y: 0.5, name: 'Tomato' });
    expect(p.id).toBeTruthy();
    expect(p.zoneId).toBe('zone-1');
    expect(p.name).toBe('Tomato');
    expect(p.variety).toBeNull();
    expect(p.icon).toBeNull();
    expect(p.spacingFt).toBeNull();
  });
});
