import { beforeEach, describe, expect, it } from 'vitest';
import { useGardenStore } from './gardenStore';

describe('gardenStore', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
  });

  it('initializes with a default garden', () => {
    const { garden } = useGardenStore.getState();
    expect(garden.name).toBe('My Garden');
    expect(garden.widthFt).toBe(20);
    expect(garden.heightFt).toBe(20);
    expect(garden.structures).toEqual([]);
    expect(garden.zones).toEqual([]);
    expect(garden.plantings).toEqual([]);
  });

  it('adds a structure', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 8 });
    const { garden } = useGardenStore.getState();
    expect(garden.structures).toHaveLength(1);
    expect(garden.structures[0].type).toBe('raised-bed');
  });

  it('removes a structure', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'pot', x: 1, y: 1, width: 2, height: 2 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useGardenStore.getState().removeStructure(id);
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('updates a structure', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 8 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useGardenStore.getState().updateStructure(id, { label: 'Herbs', x: 5 });
    const s = useGardenStore.getState().garden.structures[0];
    expect(s.label).toBe('Herbs');
    expect(s.x).toBe(5);
    expect(s.width).toBe(4);
  });

  it('adds a zone', () => {
    const { addZone } = useGardenStore.getState();
    addZone({ x: 0, y: 0, width: 3, height: 3 });
    expect(useGardenStore.getState().garden.zones).toHaveLength(1);
  });

  it('removes a zone and its plantings', () => {
    const { addZone, addPlanting, removeZone } = useGardenStore.getState();
    addZone({ x: 0, y: 0, width: 3, height: 3 });
    const zoneId = useGardenStore.getState().garden.zones[0].id;
    addPlanting({ zoneId, x: 0.5, y: 0.5, name: 'Tomato' });
    expect(useGardenStore.getState().garden.plantings).toHaveLength(1);
    removeZone(zoneId);
    expect(useGardenStore.getState().garden.zones).toHaveLength(0);
    expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
  });

  it('adds a planting', () => {
    const { addZone, addPlanting } = useGardenStore.getState();
    addZone({ x: 0, y: 0, width: 3, height: 3 });
    const zoneId = useGardenStore.getState().garden.zones[0].id;
    addPlanting({ zoneId, x: 1, y: 1, name: 'Basil' });
    const p = useGardenStore.getState().garden.plantings[0];
    expect(p.name).toBe('Basil');
    expect(p.zoneId).toBe(zoneId);
  });

  it('updates garden settings', () => {
    useGardenStore.getState().updateGarden({ name: 'Backyard', widthFt: 40 });
    const { garden } = useGardenStore.getState();
    expect(garden.name).toBe('Backyard');
    expect(garden.widthFt).toBe(40);
    expect(garden.heightFt).toBe(20);
  });

  it('loads a garden from JSON', () => {
    const { loadGarden } = useGardenStore.getState();
    const data = {
      id: 'test-id',
      version: 1,
      name: 'Loaded',
      widthFt: 30,
      heightFt: 25,
      gridCellSizeFt: 0.5,
      displayUnit: 'ft' as const,
      blueprint: null,
      groundColor: '#4a7c59',
      structures: [],
      zones: [],
      plantings: [],
    };
    loadGarden(data);
    expect(useGardenStore.getState().garden.name).toBe('Loaded');
    expect(useGardenStore.getState().garden.gridCellSizeFt).toBe(0.5);
  });
});
