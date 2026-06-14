import { asNodeId } from '@orochi235/weasel';
import { describe, expect, it } from 'vitest';
import type { Garden, Planting, Structure, Zone } from '../model/types';
import { createGarden } from '../model/types';
import { gardenToScene, sceneToGarden, splitBase } from './gardenConverters';
import { createGardenScene } from './gardenScene';
import { deepEqual, reconcileScene } from './reconcileScene';

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
function reconcileTo(start: Garden, target: Garden) {
  const scene = createGardenScene(gardenToScene(start));
  reconcileScene(scene, target);
  return { scene, out: sceneToGarden(scene, splitBase(target)) };
}

describe('reconcileScene — add', () => {
  it('adds a new structure node that was absent from the scene', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1' })];
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's1' }), struct({ id: 's2', x: 6 })];
    const { scene, out } = reconcileTo(start, target);
    expect(scene.get(asNodeId('s2'))).toBeTruthy();
    expect(out.structures.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(out.structures.find((s) => s.id === 's2')!.x).toBe(6);
  });
});

describe('deepEqual', () => {
  it('treats undefined and absent keys as equal', () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
  });
});

describe('reconcileScene — remove', () => {
  it('removes a structure and its child plantings as one subtree', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1' }), struct({ id: 's2', x: 6 })];
    start.plantings = [plant({ id: 'p1', parentId: 's1' })];
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's2', x: 6 })];
    const { scene, out } = reconcileTo(start, target);
    expect(scene.get(asNodeId('s1'))).toBeUndefined();
    expect(scene.get(asNodeId('p1'))).toBeUndefined();
    expect(out.structures.map((s) => s.id)).toEqual(['s2']);
    expect(out.plantings).toEqual([]);
  });
});

describe('reconcileScene — setPose', () => {
  it('moves a top-level structure to new world coords', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1', x: 0, y: 0 })];
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's1', x: 5, y: 3 })];
    const { scene, out } = reconcileTo(start, target);
    expect(scene.get(asNodeId('s1'))!.pose).toMatchObject({ x: 5, y: 3 });
    expect(out.structures[0]).toMatchObject({ x: 5, y: 3 });
  });
  it('keeps a nested structure stored parent-local but round-trips to world', () => {
    const start = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    start.structures = [
      struct({ id: 'parent', x: 10, y: 10, width: 12, length: 12, container: true }),
      struct({ id: 'child', x: 12, y: 12, parentId: 'parent' }),
    ];
    const target = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    target.structures = [
      struct({ id: 'parent', x: 10, y: 10, width: 12, length: 12, container: true }),
      struct({ id: 'child', x: 14, y: 13, parentId: 'parent' }),
    ];
    const { scene, out } = reconcileTo(start, target);
    expect(scene.get(asNodeId('child'))!.pose).toMatchObject({ x: 4, y: 3 });
    expect(out.structures.find((s) => s.id === 'child')).toMatchObject({ x: 14, y: 13 });
  });
});

describe('reconcileScene — setData', () => {
  it('updates non-spatial fields (color/label) via a data op', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1', color: '#aaa', label: 'old' })];
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's1', color: '#0f0', label: 'new' })];
    const { scene, out } = reconcileTo(start, target);
    const data = scene.get(asNodeId('s1'))!.data as { color: string; label: string };
    expect(data.color).toBe('#0f0');
    expect(data.label).toBe('new');
    expect(out.structures[0]).toMatchObject({ color: '#0f0', label: 'new' });
  });
  it('emits no version bump when target equals the current scene (idempotent)', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1' })];
    start.plantings = [];
    const scene = createGardenScene(gardenToScene(start));
    const before = scene.getVersion();
    reconcileScene(scene, start);
    expect(scene.getVersion()).toBe(before);
  });
});

describe('reconcileScene — same-layer reparent', () => {
  it('moves a planting from one structure to another (both on structures layer)', () => {
    const start = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    start.structures = [
      struct({ id: 's1', x: 0, y: 0, container: true }),
      struct({ id: 's2', x: 10, y: 0, container: true }),
    ];
    start.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 1 })];
    const target = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    target.structures = [
      struct({ id: 's1', x: 0, y: 0, container: true }),
      struct({ id: 's2', x: 10, y: 0, container: true }),
    ];
    target.plantings = [plant({ id: 'p1', parentId: 's2', x: 2, y: 2 })];
    const { scene, out } = reconcileTo(start, target);
    expect(scene.get(asNodeId('p1'))!.parent).toBe('s2');
    expect(scene.get(asNodeId('p1'))!.pose).toMatchObject({ x: 2, y: 2 });
    expect(out.plantings[0]).toMatchObject({ parentId: 's2', x: 2, y: 2 });
  });
});

describe('reconcileScene — rebuild roots (kind/layer changes)', () => {
  it('reparents a planting across layers (structure → zone) via rebuild', () => {
    const start = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    start.structures = [struct({ id: 's1', x: 0, y: 0, container: true })];
    start.zones = [zone({ id: 'z1', x: 10, y: 0 })];
    start.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 1 })];
    const target = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    target.structures = [struct({ id: 's1', x: 0, y: 0, container: true })];
    target.zones = [zone({ id: 'z1', x: 10, y: 0 })];
    target.plantings = [plant({ id: 'p1', parentId: 'z1', x: 2, y: 2 })];
    const { scene, out } = reconcileTo(start, target);
    const p = scene.get(asNodeId('p1'))!;
    expect(p.parent).toBe('z1');
    expect(p.layer).toBe('zones');
    expect(out.plantings[0]).toMatchObject({ parentId: 'z1', x: 2, y: 2 });
  });
  it('promotes a leaf structure to a container when it gains its first planting', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1', container: false })];
    start.plantings = [];
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's1', container: false })];
    target.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 1 })];
    const { scene, out } = reconcileTo(start, target);
    expect(scene.get(asNodeId('s1'))!.kind).toBe('container');
    expect(scene.get(asNodeId('p1'))).toBeTruthy();
    expect(out.plantings.map((p) => p.id)).toEqual(['p1']);
  });
  it('demotes a container structure back to a leaf when its last planting is removed', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1', container: false })];
    start.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 1 })];
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's1', container: false })];
    target.plantings = [];
    const { scene, out } = reconcileTo(start, target);
    expect(scene.get(asNodeId('s1'))!.kind).toBe('leaf');
    expect(scene.get(asNodeId('p1'))).toBeUndefined();
    expect(out.plantings).toEqual([]);
  });
  it('re-adds a planting that relocates out of a demoting container (rebuild + re-add path)', () => {
    // s1 starts as a container (container:false but has child p1), s2 is an
    // explicit container. In target, p1 moves to s2 — s1 demotes to leaf
    // (rebuild root). The subtree remove drops p1, but the Adds pass re-adds it
    // under s2.
    const start = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    start.structures = [
      struct({ id: 's1', container: false, x: 0, y: 0 }),
      struct({ id: 's2', container: true, x: 10, y: 0 }),
    ];
    start.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 1 })];
    const target = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    target.structures = [
      struct({ id: 's1', container: false, x: 0, y: 0 }),
      struct({ id: 's2', container: true, x: 10, y: 0 }),
    ];
    target.plantings = [plant({ id: 'p1', parentId: 's2', x: 2, y: 2 })];
    const { scene, out } = reconcileTo(start, target);
    expect(scene.get(asNodeId('s1'))!.kind).toBe('leaf');
    expect(scene.get(asNodeId('p1'))!.parent).toBe('s2');
    expect(out.plantings[0]).toMatchObject({ parentId: 's2' });
  });
});

describe('reconcileScene — batch semantics', () => {
  it('groups a multi-planting rearrange into a single kit history entry', () => {
    const start = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    start.structures = [struct({ id: 's1', x: 0, y: 0, width: 12, length: 12, container: true })];
    start.plantings = [
      plant({ id: 'p1', parentId: 's1', x: 1, y: 1 }),
      plant({ id: 'p2', parentId: 's1', x: 2, y: 2 }),
      plant({ id: 'p3', parentId: 's1', x: 3, y: 3 }),
    ];
    const scene = createGardenScene(gardenToScene(start));
    const entriesBefore = scene.historyEntries().length;
    const target = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    target.structures = [struct({ id: 's1', x: 0, y: 0, width: 12, length: 12, container: true })];
    target.plantings = [
      plant({ id: 'p1', parentId: 's1', x: 4, y: 4 }),
      plant({ id: 'p2', parentId: 's1', x: 5, y: 5 }),
      plant({ id: 'p3', parentId: 's1', x: 6, y: 6 }),
    ];
    reconcileScene(scene, target);
    expect(scene.historyEntries().length).toBe(entriesBefore + 1);
  });
});
