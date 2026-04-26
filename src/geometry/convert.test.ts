import { describe, expect, it } from 'vitest';
import { structureToShape, zoneToShape } from './convert';
import { flattenPath } from './flatten';
import { shapeArea, pointInShape } from './ops';
import { createStructure, createZone } from '../model/types';

describe('structureToShape', () => {
  it('converts a rectangular structure to a rect path', () => {
    const s = createStructure({ type: 'raised-bed', x: 1, y: 2, width: 4, height: 3 });
    const shape = structureToShape(s);
    const pts = flattenPath(shape);
    expect(pts).toEqual([
      { x: 1, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 5 },
      { x: 1, y: 5 },
    ]);
  });

  it('converts a circular structure to an ellipse path', () => {
    const s = createStructure({ type: 'pot', x: 0, y: 0, width: 6, height: 6 });
    const shape = structureToShape(s);
    // Should be cubic bezier segments (ellipse)
    expect(shape.segments.every(seg => seg.kind === 'cubic')).toBe(true);
    // Area should approximate pi*r^2
    expect(shapeArea(shape)).toBeCloseTo(Math.PI * 9, 0);
  });

  it('point-in-shape works for converted rectangle', () => {
    const s = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const shape = structureToShape(s);
    expect(pointInShape(2, 2, shape)).toBe(true);
    expect(pointInShape(5, 5, shape)).toBe(false);
  });

  it('point-in-shape works for converted circle', () => {
    const s = createStructure({ type: 'pot', x: 0, y: 0, width: 6, height: 6 });
    const shape = structureToShape(s);
    expect(pointInShape(3, 3, shape)).toBe(true);
    expect(pointInShape(0, 0, shape)).toBe(false);
  });
});

describe('zoneToShape', () => {
  it('converts a zone to a rect path', () => {
    const z = createZone({ x: 2, y: 3, width: 5, height: 4 });
    const shape = zoneToShape(z);
    const pts = flattenPath(shape);
    expect(pts).toEqual([
      { x: 2, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 7 },
      { x: 2, y: 7 },
    ]);
  });
});
