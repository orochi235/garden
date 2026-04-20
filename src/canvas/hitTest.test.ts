import { describe, expect, it } from 'vitest';
import type { Structure, Zone } from '../model/types';
import { hitTestObjects } from './hitTest';

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
