import { describe, expect, it } from 'vitest';
import { createGarden, createPlanting, createStructure, createZone } from './types';
import { emptySeedStartingState } from './seedStarting';

describe('factory functions', () => {
  it('createGarden returns valid defaults', () => {
    const g = createGarden({ name: 'Test', widthFt: 20, lengthFt: 15 });
    expect(g.id).toBeTruthy();
    expect(g.version).toBe(1);
    expect(g.name).toBe('Test');
    expect(g.widthFt).toBe(20);
    expect(g.lengthFt).toBe(15);
    expect(g.gridCellSizeFt).toBe(1);
    expect(g.displayUnit).toBe('ft');
    expect(g.blueprint).toBeNull();
    expect(g.structures).toEqual([]);
    expect(g.zones).toEqual([]);
    expect(g.plantings).toEqual([]);
  });

  it('createStructure returns valid defaults', () => {
    const s = createStructure({ type: 'raised-bed', x: 2, y: 3, width: 4, length: 8 });
    expect(s.id).toBeTruthy();
    expect(s.type).toBe('raised-bed');
    expect(s.x).toBe(2);
    expect(s.y).toBe(3);
    expect(s.width).toBe(4);
    expect(s.length).toBe(8);
    expect(s.rotation).toBe(0);
    expect(s.color).toBeTruthy();
    expect(s.label).toBe('raised-bed');
    expect(s.zIndex).toBe(0);
    expect(s.parentId).toBeNull();
    expect(s.snapToGrid).toBe(true);
    expect(s.surface).toBe(false);
  });

  it('creates patios with surface=true', () => {
    const s = createStructure({ type: 'patio', x: 0, y: 0, width: 5, length: 5 });
    expect(s.surface).toBe(true);
  });

  it('creates paths with surface=true', () => {
    const s = createStructure({ type: 'path', x: 0, y: 0, width: 2, length: 6 });
    expect(s.surface).toBe(true);
  });

  it('creates pots with surface=false', () => {
    const s = createStructure({ type: 'pot', x: 0, y: 0, width: 1, length: 1 });
    expect(s.surface).toBe(false);
  });

  it('creates pots with circle shape', () => {
    const s = createStructure({ type: 'pot', x: 0, y: 0, width: 1, length: 1 });
    expect(s.shape).toBe('circle');
  });

  it('createZone returns valid defaults', () => {
    const z = createZone({ x: 1, y: 1, width: 3, length: 3 });
    expect(z.id).toBeTruthy();
    expect(z.x).toBe(1);
    expect(z.width).toBe(3);
    expect(z.zIndex).toBe(0);
    expect(z.parentId).toBeNull();
    expect(z.soilType).toBeNull();
    expect(z.sunExposure).toBeNull();
  });

  it('createPlanting returns valid defaults', () => {
    const p = createPlanting({ parentId: 'zone-1', x: 0.5, y: 0.5, cultivarId: 'tomato' });
    expect(p.id).toBeTruthy();
    expect(p.parentId).toBe('zone-1');
    expect(p.cultivarId).toBe('tomato');
    expect(p.label).toBe('Tomato');
    expect(p.icon).toBeNull();
  });

  it('createZone defaults pattern to null', () => {
    const z = createZone({ x: 0, y: 0, width: 3, length: 3 });
    expect(z.pattern).toBeNull();
  });

  it('createZone accepts a custom pattern', () => {
    const z = createZone({ x: 0, y: 0, width: 3, length: 3, pattern: 'crosshatch' });
    expect(z.pattern).toBe('crosshatch');
  });

  it('createZone accepts a custom color', () => {
    const z = createZone({ x: 0, y: 0, width: 3, length: 3, color: 'transparent' });
    expect(z.color).toBe('transparent');
  });
});

describe('createGarden', () => {
  it('initializes seedStarting state', () => {
    const g = createGarden({ name: 't', widthFt: 1, lengthFt: 1 });
    expect(g.seedStarting).toEqual(emptySeedStartingState());
  });
});

it('createStructure defaults layout for raised-bed to grid', () => {
  const s = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 8 });
  expect(s.layout).toEqual({ type: 'cell-grid', cellSizeFt: 1 / 6 });
});
