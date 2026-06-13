import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from './gardenStore';
import { createGarden } from '../model/types';

describe('gardenStore scene-backed facade', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('exposes a Garden composed from the scene after loadGarden', () => {
    const g = createGarden({ name: 'Loaded', widthFt: 12, lengthFt: 9 });
    g.structures = [{ id: 's1', type: 'raised-bed', shape: 'rectangle', x: 1, y: 1, width: 4, length: 8,
      rotation: 0, color: '#aaa', label: 'Bed', zIndex: 0, parentId: null, groupId: null, snapToGrid: true,
      surface: false, container: true, fill: null, layout: null, wallThicknessFt: 0.5, clipChildren: false }];
    useGardenStore.getState().loadGarden(g);

    const garden = useGardenStore.getState().garden;
    expect(garden.name).toBe('Loaded');
    expect(garden.structures).toHaveLength(1);
    expect(garden.structures[0]).toMatchObject({ id: 's1', x: 1, y: 1, width: 4, length: 8 });
  });

  it('returns a stable garden reference until the scene changes', () => {
    const a = useGardenStore.getState().garden;
    const b = useGardenStore.getState().garden;
    expect(a).toBe(b); // memoized per scene version + base
  });
});
