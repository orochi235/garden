import { beforeEach, describe, expect, it } from 'vitest';
import type { Planting, Structure, Zone } from '../model/types';
import { useUiStore } from '../store/uiStore';
import { hitTestObjects, hitTestPlantings } from './hitTest';

describe('hitTestPlantings', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });

  const structures: Structure[] = [
    {
      id: 'bed1',
      type: 'raised-bed',
      shape: 'rectangle',
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      rotation: 0,
      color: '#8B6914',
      label: '',
      zIndex: 0,
      parentId: null,
      snapToGrid: true,
      surface: false,
      container: true,
      fill: 'soil',
      arrangement: null,
      wallThicknessFt: 1 / 12,
    },
  ];
  const zones: Zone[] = [];

  // tomato has footprintFt 1.0 → radius 0.5
  const plantings: Planting[] = [
    {
      id: 'p1',
      parentId: 'bed1',
      cultivarId: 'tomato',
      x: 1,
      y: 1,
      label: 'Tomato',
      icon: null,
    },
  ];

  it('returns planting when point is within footprint radius', () => {
    // bed1 at (0,0) + planting offset (1,1) = world (1,1)
    const result = hitTestPlantings(1.2, 1.2, plantings, structures, zones);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('p1');
    expect(result!.layer).toBe('plantings');
  });

  it('returns null when point is outside footprint square', () => {
    // tomato footprint half = 0.5, center at (1,1), point at (2,2) is outside
    const result = hitTestPlantings(2, 2, plantings, structures, zones);
    expect(result).toBeNull();
  });

  it('hits corner of square that would miss a circle', () => {
    // tomato footprint half = 0.5, center at (1,1)
    // point at (1.49, 1.49) is inside the square but ~0.69 from center (outside circle)
    const result = hitTestPlantings(1.49, 1.49, plantings, structures, zones);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('p1');
  });

  it('returns null when plantings layer is locked', () => {
    useUiStore.getState().setLayerLocked('plantings', true);
    const result = hitTestPlantings(1, 1, plantings, structures, zones);
    expect(result).toBeNull();
  });

  it('returns null when planting has no matching parent', () => {
    const orphan: Planting[] = [
      { id: 'p2', parentId: 'nonexistent', cultivarId: 'tomato', x: 1, y: 1, label: '', icon: null },
    ];
    const result = hitTestPlantings(1, 1, orphan, structures, zones);
    expect(result).toBeNull();
  });

  it('hits planting in a zone parent', () => {
    const zoneParent: Zone[] = [
      {
        id: 'z1', x: 5, y: 5, width: 4, height: 4, color: '#fff',
        label: '', zIndex: 0, parentId: null, soilType: null,
        sunExposure: null, arrangement: null, pattern: null,
      },
    ];
    const zonePlanting: Planting[] = [
      { id: 'pz', parentId: 'z1', cultivarId: 'basil', x: 1, y: 1, label: '', icon: null },
    ];
    // basil footprintFt 0.5, radius 0.25. Center at (5+1, 5+1) = (6, 6)
    const result = hitTestPlantings(6.1, 6.1, zonePlanting, [], zoneParent);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('pz');
  });
});

describe('hitTestObjects', () => {
  const structures: Structure[] = [
    {
      id: 's1',
      type: 'raised-bed',
      shape: 'rectangle',
      x: 2,
      y: 2,
      width: 4,
      height: 4,
      rotation: 0,
      color: '#8B6914',
      label: '',
      zIndex: 0,
      parentId: null,
      snapToGrid: true,
      surface: false,
      container: true,
      fill: 'soil',
      arrangement: { type: 'rows', spacingFt: 0.5, itemSpacingFt: 0.5, direction: 0, marginFt: 0.25 },
      wallThicknessFt: 1 / 12,
    },
  ];
  const zones: Zone[] = [
    {
      id: 'z1',
      x: 10,
      y: 10,
      width: 3,
      height: 3,
      color: '#7FB06944',
      label: '',
      zIndex: 0,
      parentId: null,
      soilType: null,
      sunExposure: null,
      arrangement: { type: 'grid', spacingXFt: 0.5, spacingYFt: 0.5, marginFt: 0.25 },
      pattern: null,
    },
  ];

  it('returns structure when point is inside', () => {
    expect(hitTestObjects(3, 3, structures, zones, 'structures')?.id).toBe('s1');
  });
  it('returns null when point is outside', () => {
    expect(hitTestObjects(20, 20, structures, zones, 'structures')).toBeNull();
  });
  it('returns zone when testing zone layer', () => {
    expect(hitTestObjects(11, 11, structures, zones, 'zones')?.id).toBe('z1');
  });
  it('returns null for structure area on zone layer', () => {
    expect(hitTestObjects(3, 3, structures, zones, 'zones')).toBeNull();
  });
  it('returns topmost by zIndex', () => {
    const two: Structure[] = [
      { ...structures[0], id: 'bottom', zIndex: 0 },
      { ...structures[0], id: 'top', zIndex: 1, x: 3, y: 3, width: 4, height: 4 },
    ];
    expect(hitTestObjects(4, 4, two, [], 'structures')?.id).toBe('top');
  });
});
