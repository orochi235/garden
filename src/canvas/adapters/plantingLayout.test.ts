import { describe, it, expect } from 'vitest';
import { plantingLayoutFor } from './plantingLayout';
import type { Garden } from '../../model/types';

function makeGarden(): Garden {
  return {
    widthFt: 100,
    lengthFt: 100,
    gridCellSizeFt: 1,
    groundColor: '#000',
    structures: [
      {
        id: 'pot-1', type: 'pot', shape: 'circle',
        x: 10, y: 10, width: 4, length: 4,
        color: '#888', zIndex: 0, label: '',
        surface: false, fill: null, wallThicknessFt: 0.25,
        groupId: null, parentId: null, container: true,
        rotation: 0, snapToGrid: true, clipChildren: true,
        layout: { type: 'single' },
      },
      {
        id: 'bed-1', type: 'raised-bed', shape: 'rectangle',
        x: 20, y: 20, width: 6, length: 4,
        color: '#888', zIndex: 0, label: '',
        surface: false, fill: null, wallThicknessFt: 0.5,
        groupId: null, parentId: null, container: true,
        rotation: 0, snapToGrid: true, clipChildren: true,
        layout: { type: 'grid', cellSizeFt: 1 },
      },
      {
        id: 'free-1', type: 'raised-bed', shape: 'rectangle',
        x: 30, y: 30, width: 4, length: 4,
        color: '#888', zIndex: 0, label: '',
        surface: false, fill: null, wallThicknessFt: 0,
        groupId: null, parentId: null, container: true,
        rotation: 0, snapToGrid: true, clipChildren: true,
        layout: null,
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

  it('returns null for containers with null layout (free positioning)', () => {
    expect(plantingLayoutFor(makeGarden, 'free-1')).toBeNull();
  });

  it('single layout: one drop target at container center', () => {
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

  it('grid layout: drop targets are free slots only', () => {
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
