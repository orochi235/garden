import { describe, expect, it } from 'vitest';
import { createGardenScene, GARDEN_LAYERS } from './gardenScene';

describe('createGardenScene', () => {
  it('contains the five garden layers in the correct render order', () => {
    expect(GARDEN_LAYERS).toEqual(['ground', 'blueprint', 'structures', 'zones', 'plantings']);
  });

  it('creates an empty scene with no undo history', () => {
    const scene = createGardenScene([]);
    expect(scene.roots).toEqual([]);
    expect(scene.canUndo()).toBe(false);
  });

  it('seeds initial nodes without making them undoable', () => {
    const scene = createGardenScene([
      {
        kind: 'container',
        layer: 'structures',
        pose: { x: 0, y: 0, width: 4, height: 8 },
        data: {
          kind: 'structure',
          type: 'raised-bed',
          color: '#000',
          label: 'A',
          zIndex: 0,
          groupId: null,
          snapToGrid: true,
          surface: false,
          container: true,
          fill: null,
          layout: null,
          wallThicknessFt: 0.5,
          clipChildren: false,
        },
      },
    ]);
    expect(scene.roots).toHaveLength(1);
    expect(scene.canUndo()).toBe(false); // initial nodes are not history entries
  });
});
