import { describe, it, expect } from 'vitest';
import { plantingLayoutFor } from './plantingLayout';
import type { Garden, Structure } from '../../model/types';

function makeGarden(): Garden {
  return {
    widthFt: 100,
    heightFt: 100,
    gridCellSizeFt: 1,
    groundColor: '#000',
    structures: [
      {
        id: 'pot-1', type: 'pot', shape: 'circle',
        x: 10, y: 10, width: 4, height: 4,
        color: '#888', zIndex: 0, label: '',
        surface: null, fill: null, wallThicknessFt: 0.25,
        groupId: null, container: true,
        arrangement: { type: 'free' },
      },
      {
        id: 'bed-1', type: 'raised-bed', shape: 'rectangle',
        x: 20, y: 20, width: 6, height: 4,
        color: '#888', zIndex: 0, label: '',
        surface: null, fill: null, wallThicknessFt: 0.5,
        groupId: null, container: true,
        arrangement: { type: 'grid', spacingXFt: 1, spacingYFt: 1, marginFt: 0.5 },
      },
    ],
    zones: [],
    plantings: [],
    seedStarting: { trays: [], seedlings: [] },
  } as unknown as Garden;
}

describe('plantingLayoutFor', () => {
  it('returns null for non-container ids', () => {
    expect(plantingLayoutFor(makeGarden, 'nope')).toBeNull();
  });

  it('free arrangement: single drop target at container center', () => {
    const garden = makeGarden();
    const layout = plantingLayoutFor(() => garden, 'pot-1')!;
    expect(layout).not.toBeNull();
    const targets = layout.getDropTargets(
      { id: 'pot-1', bounds: { x: 10, y: 10, width: 4, height: 4 } },
      [],
      { id: 'p', originPose: { x: 0, y: 0 }, pose: { x: 0, y: 0 }, sourceContainerId: null },
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].pose).toEqual({ x: 12, y: 12 });
  });

  it('contains() honors circle shape for pots', () => {
    const garden = makeGarden();
    const layout = plantingLayoutFor(() => garden, 'pot-1')!;
    // Center is inside; corner of bounding box is outside the ellipse.
    expect(layout.contains!({ x: 10, y: 10, width: 4, height: 4 } as never, { x: 12, y: 12 })).toBe(true);
    expect(layout.contains!({ x: 10, y: 10, width: 4, height: 4 } as never, { x: 10.05, y: 10.05 })).toBe(false);
  });

  it('grid arrangement: drop targets are free slots only', () => {
    const garden = makeGarden();
    const layout = plantingLayoutFor(() => garden, 'bed-1')!;
    const targets = layout.getDropTargets(
      { id: 'bed-1', bounds: { x: 20, y: 20, width: 6, height: 4 } },
      [],
      { id: 'p', originPose: { x: 0, y: 0 }, pose: { x: 0, y: 0 }, sourceContainerId: null },
    );
    expect(targets.length).toBeGreaterThan(0);
    // Slot poses fall within the planted-bounds rect.
    for (const t of targets) {
      expect(t.pose.x).toBeGreaterThanOrEqual(20);
      expect(t.pose.x).toBeLessThanOrEqual(26);
      expect(t.pose.y).toBeGreaterThanOrEqual(20);
      expect(t.pose.y).toBeLessThanOrEqual(24);
    }
  });

  it('commitDrop emits reparent + transform when source differs', () => {
    const garden = makeGarden();
    const layout = plantingLayoutFor(() => garden, 'pot-1')!;
    const ops = layout.commitDrop(
      { id: 'pot-1', bounds: { x: 10, y: 10, width: 4, height: 4 } },
      [],
      {
        id: 'p1',
        originPose: { x: 5, y: 5 },
        pose: { x: 12, y: 12 },
        sourceContainerId: 'bed-1',
      },
      { pose: { x: 12, y: 12 }, origin: { x: 12, y: 12 } },
    );
    expect(ops).toHaveLength(2);
  });

  it('preserves regionId on drop target metadata for multi arrangements', () => {
    const garden = makeGarden();
    // Swap bed-1 to a multi arrangement with two single-slot regions
    const bed = garden.structures.find((s) => s.id === 'bed-1') as Structure;
    bed.arrangement = {
      type: 'multi',
      regions: [
        { id: 'left', bounds: { x: 0, y: 0, w: 0.5, h: 1 }, arrangement: { type: 'single' } },
        { id: 'right', bounds: { x: 0.5, y: 0, w: 0.5, h: 1 }, arrangement: { type: 'single' } },
      ],
    };
    const layout = plantingLayoutFor(() => garden, 'bed-1')!;
    const targets = layout.getDropTargets(
      { id: 'bed-1', bounds: { x: 20, y: 20, width: 6, height: 4 } },
      [],
      { id: 'p', originPose: { x: 0, y: 0 }, pose: { x: 0, y: 0 }, sourceContainerId: null },
    );
    expect(targets).toHaveLength(2);
    const leftTarget = targets.find((t) => (t.meta as { regionId?: string } | undefined)?.regionId === 'left');
    const rightTarget = targets.find((t) => (t.meta as { regionId?: string } | undefined)?.regionId === 'right');
    expect(leftTarget).toBeDefined();
    expect(rightTarget).toBeDefined();
  });

  it('commitDrop omits reparent when source is the same container', () => {
    const garden = makeGarden();
    const layout = plantingLayoutFor(() => garden, 'pot-1')!;
    const ops = layout.commitDrop(
      { id: 'pot-1', bounds: { x: 10, y: 10, width: 4, height: 4 } },
      [],
      {
        id: 'p1',
        originPose: { x: 5, y: 5 },
        pose: { x: 12, y: 12 },
        sourceContainerId: 'pot-1',
      },
      { pose: { x: 12, y: 12 }, origin: { x: 12, y: 12 } },
    );
    expect(ops).toHaveLength(1);
  });
});
