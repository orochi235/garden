import { describe, it, expect } from 'vitest';
import { PLANTING_LAYERS, buildPlantingLayerData } from './plantingLayers';
import type { Planting, Structure, Zone } from '../../model/types';

function makePlanting(overrides: Partial<Planting> = {}): Planting {
  return {
    id: 'p1',
    parentId: 'z1',
    x: 0,
    y: 0,
    cultivarId: 'c1',
    ...overrides,
  } as Planting;
}

function makeZone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: 'z1',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    color: '#888888',
    zIndex: 0,
    label: '',
    pattern: null,
    arrangement: null,
    wallThicknessFt: 0,
    ...overrides,
  } as unknown as Zone;
}

function makeStructure(overrides: Partial<Structure> = {}): Structure {
  return {
    id: 's1',
    x: 0,
    y: 0,
    width: 4,
    height: 4,
    color: '#888888',
    zIndex: 0,
    label: '',
    type: 'raised-bed',
    shape: 'rectangle',
    surface: null,
    fill: null,
    wallThicknessFt: 0.5,
    groupId: null,
    container: true,
    arrangement: { type: 'grid', spacingFt: 1 },
    ...overrides,
  } as unknown as Structure;
}

const baseView = { panX: 0, panY: 0, zoom: 1 };

describe('PLANTING_LAYERS', () => {
  it('has exactly 7 layers in correct order', () => {
    expect(PLANTING_LAYERS).toHaveLength(7);
    expect(PLANTING_LAYERS.map((l) => l.id)).toEqual([
      'container-overlays',
      'planting-spacing',
      'planting-icons',
      'planting-measurements',
      'planting-highlights',
      'planting-labels',
      'container-walls',
    ]);
  });

  it('planting-icons has alwaysOn=true', () => {
    const layer = PLANTING_LAYERS.find((l) => l.id === 'planting-icons');
    expect(layer?.alwaysOn).toBe(true);
  });

  it('planting-measurements has defaultVisible=false', () => {
    const layer = PLANTING_LAYERS.find((l) => l.id === 'planting-measurements');
    expect(layer?.defaultVisible).toBe(false);
  });

  it('other layers do not have alwaysOn=true (except planting-icons)', () => {
    const alwaysOnLayers = PLANTING_LAYERS.filter((l) => l.alwaysOn).map((l) => l.id);
    expect(alwaysOnLayers).toEqual(['planting-icons']);
  });
});

describe('buildPlantingLayerData', () => {
  it('builds parentMap from structures and zones', () => {
    const zone = makeZone({ id: 'z1' });
    const structure = makeStructure({ id: 's1', container: true });
    const nonContainerStructure = makeStructure({ id: 's2', container: false });

    const data = buildPlantingLayerData(
      [],
      [zone],
      [structure, nonContainerStructure],
      baseView, 800, 600, 0, 'none', 13, [], 1,
    );

    expect(data.parentMap.has('z1')).toBe(true);
    expect(data.parentMap.has('s1')).toBe(true);
    expect(data.parentMap.has('s2')).toBe(false);
  });

  it('computes childCount correctly', () => {
    const zone = makeZone({ id: 'z1' });
    const p1 = makePlanting({ id: 'p1', parentId: 'z1' });
    const p2 = makePlanting({ id: 'p2', parentId: 'z1' });
    const p3 = makePlanting({ id: 'p3', parentId: 's1' });

    const data = buildPlantingLayerData(
      [p1, p2, p3],
      [zone],
      [],
      baseView, 800, 600, 0, 'none', 13, [], 1,
    );

    expect(data.childCount.get('z1')).toBe(2);
    expect(data.childCount.get('s1')).toBe(1);
  });

  it('builds plantingsByParent correctly', () => {
    const zone = makeZone({ id: 'z1' });
    const p1 = makePlanting({ id: 'p1', parentId: 'z1' });
    const p2 = makePlanting({ id: 'p2', parentId: 'z1' });

    const data = buildPlantingLayerData(
      [p1, p2],
      [zone],
      [],
      baseView, 800, 600, 0, 'none', 13, [], 1,
    );

    expect(data.plantingsByParent.has('z1')).toBe(true);
    expect(data.plantingsByParent.get('z1')).toHaveLength(2);
  });

  it('returns mutable labelOccluders as empty array', () => {
    const data = buildPlantingLayerData(
      [], [], [], baseView, 800, 600, 0, 'none', 13, [], 1,
    );
    expect(data.labelOccluders).toEqual([]);
    // Should be mutable
    data.labelOccluders.push({ x: 0, y: 0, w: 10, h: 10 });
    expect(data.labelOccluders).toHaveLength(1);
  });

  it('passes through view and canvas dimensions', () => {
    const view = { panX: 10, panY: 20, zoom: 2 };
    const data = buildPlantingLayerData(
      [], [], [], view, 1024, 768, 0.5, 'all', 14, ['id1'], 1.2,
    );
    expect(data.view).toBe(view);
    expect(data.canvasWidth).toBe(1024);
    expect(data.canvasHeight).toBe(768);
    expect(data.highlightOpacity).toBe(0.5);
    expect(data.labelMode).toBe('all');
    expect(data.labelFontSize).toBe(14);
    expect(data.selectedIds).toEqual(['id1']);
    expect(data.plantIconScale).toBe(1.2);
  });
});
