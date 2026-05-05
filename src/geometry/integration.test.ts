import { describe, expect, it } from 'vitest';
import { createStructure } from '../model/types';
import { structureToShape } from './convert';
import { shapeUnion, shapeDifference, shapeOffset, shapeArea, pointInShape, shapeBounds } from './ops';
import { traceShapePath, tracePolyline } from './canvas';
import { flattenPath } from './flatten';

describe('geometry integration', () => {
  it('unions two overlapping raised beds', () => {
    const bed1 = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 8 });
    const bed2 = createStructure({ type: 'raised-bed', x: 2, y: 0, width: 4, length: 8 });

    const shape1 = structureToShape(bed1);
    const shape2 = structureToShape(bed2);

    const united = shapeUnion([shape1, shape2]);
    expect(united).toHaveLength(1);

    // Area should be 4*8 + 4*8 - 2*8 = 48
    expect(shapeArea(united[0])).toBeCloseTo(48, 0);

    // Point in the overlap region should be inside
    expect(pointInShape(3, 4, united[0])).toBe(true);
    // Point outside both should be outside
    expect(pointInShape(7, 4, united[0])).toBe(false);
  });

  it('insets a bed by wall thickness', () => {
    const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 10, length: 10 });
    const shape = structureToShape(bed);
    const inset = shapeOffset(shape, -bed.wallThicknessFt);

    expect(inset).toHaveLength(1);
    const bounds = shapeBounds(inset[0]);
    const wall = bed.wallThicknessFt;
    expect(bounds.x).toBeCloseTo(wall, 1);
    expect(bounds.y).toBeCloseTo(wall, 1);
    expect(bounds.width).toBeCloseTo(10 - wall * 2, 1);
    expect(bounds.height).toBeCloseTo(10 - wall * 2, 1);
  });

  it('subtracts a circular pot from a rectangular zone', () => {
    const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 10, length: 10 });
    const pot = createStructure({ type: 'pot', x: 3, y: 3, width: 4, length: 4 });

    const bedShape = structureToShape(bed);
    const potShape = structureToShape(pot);

    const result = shapeDifference(bedShape, [potShape]);
    const area = result.reduce((sum, p) => sum + shapeArea(p), 0);
    // ~100 - pi*4 ≈ 87.4
    expect(area).toBeCloseTo(100 - Math.PI * 4, 0);
  });

  it('flattened paths can be traced to a mock canvas sink', () => {
    const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 3 });
    const shape = structureToShape(bed);

    // Trace source shape (uses native bezierCurveTo if curves)
    const calls1: string[] = [];
    const sink1 = {
      moveTo() { calls1.push('moveTo'); },
      lineTo() { calls1.push('lineTo'); },
      bezierCurveTo() { calls1.push('bezierCurveTo'); },
      closePath() { calls1.push('closePath'); },
    };
    traceShapePath(sink1, shape);
    expect(calls1[0]).toBe('moveTo');
    expect(calls1[calls1.length - 1]).toBe('closePath');

    // Trace flattened polyline (only moveTo/lineTo)
    const pts = flattenPath(shape);
    const calls2: string[] = [];
    const sink2 = {
      moveTo() { calls2.push('moveTo'); },
      lineTo() { calls2.push('lineTo'); },
      bezierCurveTo() { calls2.push('bezierCurveTo'); },
      closePath() { calls2.push('closePath'); },
    };
    tracePolyline(sink2, pts);
    expect(calls2).not.toContain('bezierCurveTo');
  });
});
