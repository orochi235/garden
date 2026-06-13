import { describe, expect, it } from 'vitest';
import type { Planting, Structure } from '../model/types';
import { createGarden } from '../model/types';
import { gardenToScene } from './gardenConverters';
import { createGardenScene } from './gardenScene';

function struct(p: Partial<Structure> & Pick<Structure, 'id'>): Structure {
  return {
    type: 'raised-bed',
    shape: 'rectangle',
    x: 0,
    y: 0,
    width: 4,
    length: 8,
    rotation: 0,
    color: '#aaa',
    label: '',
    zIndex: 0,
    parentId: null,
    groupId: null,
    snapToGrid: true,
    surface: false,
    container: true,
    fill: null,
    layout: null,
    wallThicknessFt: 0.5,
    clipChildren: false,
    ...p,
  };
}
function plant(p: Partial<Planting> & Pick<Planting, 'id' | 'parentId'>): Planting {
  return { cultivarId: 'tomato', x: 1, y: 1, label: '', icon: null, ...p };
}

describe('gardenToScene', () => {
  it('maps a container structure to a Scene container node on the structures layer', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 's1', length: 8, container: true })];
    const scene = createGardenScene(gardenToScene(g));
    const node = scene.get('s1' as never)!;
    expect(node.kind).toBe('container');
    expect(node.layer).toBe('structures');
    expect(node.pose).toMatchObject({ x: 0, y: 0, width: 4, height: 8 });
    expect(node.parent).toBeNull();
  });

  it('maps a non-container structure (fence) to a leaf', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 'f1', type: 'fence', container: false })];
    const scene = createGardenScene(gardenToScene(g));
    expect(scene.get('f1' as never)!.kind).toBe('leaf');
  });

  it('nests a planting under its parent structure with a derived square pose', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 's1' })];
    g.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 2, cultivarId: 'tomato' })];
    const scene = createGardenScene(gardenToScene(g));
    const p = scene.get('p1' as never)!;
    expect(p.kind).toBe('leaf');
    // Weasel requires child layer === parent layer; structure parents → 'structures' layer.
    expect(p.layer).toBe('structures');
    expect(p.parent).toBe('s1');
    expect(p.pose.x).toBe(1);
    expect(p.pose.y).toBe(2);
    expect(p.pose.width).toBeCloseTo(p.pose.height);
    expect(p.pose.width).toBeGreaterThan(0);
  });

  it('orders sibling roots by ascending zIndex', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 'hi', zIndex: 5 }), struct({ id: 'lo', zIndex: 1 })];
    const scene = createGardenScene(gardenToScene(g));
    expect(scene.roots).toEqual(['lo', 'hi']);
  });
});
