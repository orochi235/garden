import { asNodeId } from '@orochi235/weasel';
import { describe, expect, it } from 'vitest';
import { getCultivar } from '../model/cultivars';
import type { Planting, Structure, Zone } from '../model/types';
import { createGarden } from '../model/types';
import { gardenToScene, sceneToGarden, splitBase } from './gardenConverters';
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
function zone(p: Partial<Zone> & Pick<Zone, 'id'>): Zone {
  return {
    x: 0,
    y: 0,
    width: 4,
    length: 4,
    color: '#aaa',
    label: '',
    zIndex: 0,
    parentId: null,
    soilType: null,
    sunExposure: null,
    layout: null,
    pattern: null,
    ...p,
  };
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
    const cultivarId = 'tomato';
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 's1' })];
    g.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 2, cultivarId })];
    const scene = createGardenScene(gardenToScene(g));
    const p = scene.get('p1' as never)!;
    expect(p.kind).toBe('leaf');
    // Weasel requires child layer === parent layer; structure parents → 'structures' layer.
    expect(p.layer).toBe('structures');
    expect(p.parent).toBe('s1');
    expect(p.pose.x).toBe(1);
    expect(p.pose.y).toBe(2);
    expect(p.pose.width).toBeCloseTo(p.pose.height);
    const cultivar = getCultivar(cultivarId);
    if (cultivar) {
      expect(p.pose.width).toBeCloseTo(cultivar.footprintFt);
    } else {
      expect(p.pose.width).toBeGreaterThan(0);
    }
  });

  it('nests a planting under a zone on the zones layer', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.zones = [zone({ id: 'z1' })];
    g.plantings = [plant({ id: 'p1', parentId: 'z1' })];
    const scene = createGardenScene(gardenToScene(g));
    const p = scene.get('p1' as never)!;
    expect(p.layer).toBe('zones');
    expect(p.parent).toBe('z1');
  });

  it('throws on a planting with an unknown parentId', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.plantings = [plant({ id: 'p1', parentId: 'nonexistent' })];
    expect(() => gardenToScene(g)).toThrow(
      "gardenToScene: planting 'p1' has unknown parentId 'nonexistent'",
    );
  });

  it('orders sibling roots by ascending zIndex', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 'hi', zIndex: 5 }), struct({ id: 'lo', zIndex: 1 })];
    const scene = createGardenScene(gardenToScene(g));
    expect(scene.roots).toEqual(['lo', 'hi']);
  });
});

describe('sceneToGarden round-trip', () => {
  it('round-trips structures, zones, and plantings (modulo derived planting size)', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 's1', x: 1, y: 2, width: 4, length: 8, rotation: 90 })];
    g.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 2 })];
    const scene = createGardenScene(gardenToScene(g));

    const out = sceneToGarden(scene, splitBase(g));
    expect(out.structures).toHaveLength(1);
    expect(out.structures[0]).toMatchObject({
      id: 's1',
      x: 1,
      y: 2,
      width: 4,
      length: 8,
      rotation: 90,
    });
    expect(out.plantings[0]).toMatchObject({ id: 'p1', parentId: 's1', x: 1, y: 2 });
    expect(Object.keys(out.plantings[0])).not.toContain('width');
    expect(out.name).toBe('g');
    expect(out.nursery).toBe(g.nursery); // base reattached by reference
    expect(out.collection).toBe(g.collection);
  });

  it('preserves zIndex on the way back', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 'hi', zIndex: 5 }), struct({ id: 'lo', zIndex: 1 })];
    const scene = createGardenScene(gardenToScene(g));
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.structures.map((s) => s.id).sort()).toEqual(['hi', 'lo']);
    expect(out.structures.find((s) => s.id === 'hi')!.zIndex).toBe(5);
  });

  it('throws when a planting node has no parent', () => {
    const g = createGarden({ name: 'g', widthFt: 1, lengthFt: 1 });
    const scene = createGardenScene([]);
    scene.add({
      kind: 'leaf',
      layer: 'structures',
      pose: { x: 0, y: 0, width: 1, height: 1 },
      data: { kind: 'planting', cultivarId: 'x', label: '', icon: null },
      parent: null,
      id: asNodeId('orphan'),
    });
    expect(() => sceneToGarden(scene, splitBase(g))).toThrow(/no parent/);
  });
});
