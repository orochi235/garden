import { asNodeId, composeRectPose } from '@orochi235/weasel';
import { describe, expect, it } from 'vitest';
import { getCultivar } from '../model/cultivars';
import type { Planting, Structure, Zone } from '../model/types';
import { createGarden } from '../model/types';
import {
  gardenToScene,
  gardenToSerializedScene,
  sceneToGarden,
  splitBase,
} from './gardenConverters';
import type { GardenPose } from './gardenScene';
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
    // Plantings render in the dedicated top `plantings` layer (above container
    // bodies) while staying a scene child of their structure parent.
    expect(p.layer).toBe('plantings');
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

  it('nests a planting under a zone but keeps it on the top plantings layer', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.zones = [zone({ id: 'z1' })];
    g.plantings = [plant({ id: 'p1', parentId: 'z1' })];
    const scene = createGardenScene(gardenToScene(g));
    const p = scene.get('p1' as never)!;
    expect(p.layer).toBe('plantings');
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
    // `nursery` is no longer part of GardenBase / sceneToGarden — it is backed
    // by its own NurseryScene and composed into garden.nursery in the store.
    expect(out.collection).toBe(g.collection); // base reattached by reference
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

describe('sceneToGarden nested frame (compose world back)', () => {
  it('round-trips a nested structure to garden world coordinates (with rotation)', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.structures = [
      struct({ id: 's1', x: 1, y: 2, width: 10, length: 10, container: true }),
      struct({
        id: 's2',
        x: 5,
        y: 6,
        width: 3,
        length: 3,
        rotation: 45,
        parentId: 's1',
        container: true,
      }),
    ];
    const scene = createGardenScene(gardenToScene(g));
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.structures.find((s) => s.id === 's2')).toMatchObject({
      x: 5,
      y: 6,
      width: 3,
      length: 3,
      rotation: 45,
      parentId: 's1',
    });
  });

  it('round-trips multi-level nested structures', () => {
    const g = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    g.structures = [
      struct({ id: 'a', x: 1, y: 1, container: true }),
      struct({ id: 'b', x: 4, y: 5, parentId: 'a', container: true }),
      struct({ id: 'c', x: 9, y: 8, parentId: 'b', container: true }),
    ];
    const scene = createGardenScene(gardenToScene(g));
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.structures.find((s) => s.id === 'c')).toMatchObject({ x: 9, y: 8, parentId: 'b' });
    expect(out.structures.find((s) => s.id === 'b')).toMatchObject({ x: 4, y: 5, parentId: 'a' });
  });

  it('round-trips a nested zone to garden world coordinates', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.zones = [zone({ id: 'z1', x: 2, y: 3 }), zone({ id: 'z2', x: 7, y: 8, parentId: 'z1' })];
    const scene = createGardenScene(gardenToScene(g));
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.zones.find((z) => z.id === 'z2')).toMatchObject({ x: 7, y: 8, parentId: 'z1' });
  });

  it('round-trips a planting under a nested structure (local coords preserved)', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.structures = [
      struct({ id: 's1', x: 1, y: 2, container: true }),
      struct({ id: 's2', x: 5, y: 6, parentId: 's1', container: true }),
    ];
    g.plantings = [plant({ id: 'p1', parentId: 's2', x: 1, y: 1 })];
    const scene = createGardenScene(gardenToScene(g));
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.plantings.find((p) => p.id === 'p1')).toMatchObject({ parentId: 's2', x: 1, y: 1 });
  });
});

// Helper: kit world pose of a node by composing local poses up the parent chain.
function kitWorld(scene: ReturnType<typeof createGardenScene>, id: string): GardenPose {
  const n = scene.get(asNodeId(id))!;
  return n.parent ? composeRectPose(kitWorld(scene, String(n.parent)), n.pose) : n.pose;
}

describe('gardenToScene nested frame (parent-local poses)', () => {
  it('stores a nested structure pose parent-local and composes back to the garden world pose', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.structures = [
      struct({ id: 's1', x: 1, y: 2, width: 10, length: 10, container: true }),
      struct({ id: 's2', x: 5, y: 6, width: 3, length: 3, parentId: 's1', container: true }),
    ];
    const scene = createGardenScene(gardenToScene(g));
    expect(scene.get('s2' as never)!.pose).toMatchObject({ x: 4, y: 4 });
    expect(kitWorld(scene, 's2')).toMatchObject({ x: 5, y: 6 });
  });

  it('stores a nested zone pose parent-local', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.zones = [zone({ id: 'z1', x: 2, y: 3 }), zone({ id: 'z2', x: 7, y: 8, parentId: 'z1' })];
    const scene = createGardenScene(gardenToScene(g));
    expect(scene.get('z2' as never)!.pose).toMatchObject({ x: 5, y: 5 });
    expect(kitWorld(scene, 'z2')).toMatchObject({ x: 7, y: 8 });
  });

  it('keeps a planting under a nested structure at the correct composed world position', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.structures = [
      struct({ id: 's1', x: 1, y: 2, container: true }),
      struct({ id: 's2', x: 5, y: 6, parentId: 's1', container: true }),
    ];
    g.plantings = [plant({ id: 'p1', parentId: 's2', x: 1, y: 1 })];
    const scene = createGardenScene(gardenToScene(g));
    expect(scene.get('p1' as never)!.pose).toMatchObject({ x: 1, y: 1 });
    expect(kitWorld(scene, 'p1')).toMatchObject({ x: 6, y: 7 });
  });
});

describe('gardenToSerializedScene', () => {
  it('produces a v1 SerializedScene that loadState round-trips back to the garden', () => {
    const g = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    g.structures = [
      struct({ id: 's1', x: 1, y: 1, width: 12, length: 12, container: true }),
      struct({ id: 's2', x: 14, y: 14, parentId: 's1' }),
    ];
    g.zones = [zone({ id: 'z1', x: 0, y: 20 })];
    g.plantings = [plant({ id: 'p1', parentId: 's1', x: 2, y: 2 })];

    const serialized = gardenToSerializedScene(g);
    expect(serialized.version).toBe(1);
    expect(serialized.systemLayers.map((l) => l.id)).toEqual([
      'ground',
      'blueprint',
      'zones',
      'structures',
      'plantings',
    ]);
    expect(serialized.nodes.find((n) => n.id === ('s1' as never))!.parent).toBeUndefined();
    expect(serialized.nodes.find((n) => n.id === ('s2' as never))!.parent).toBe('s1');

    const scene = createGardenScene([]);
    scene.loadState(serialized);
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.structures.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(out.zones.map((z) => z.id)).toEqual(['z1']);
    expect(out.plantings.map((p) => p.id)).toEqual(['p1']);
    expect(out.structures.find((s) => s.id === 's2')).toMatchObject({ x: 14, y: 14 });
    expect(out.structures.find((s) => s.id === 's1')).toMatchObject({ x: 1, y: 1 });
  });
});
