import { beforeEach, describe, expect, it } from 'vitest';
import { emptySeedStartingState } from '../model/seedStarting';
import { blankGarden, useGardenStore } from './gardenStore';

describe('gardenStore', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
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
    addPlanting({ parentId: zoneId, x: 0.5, y: 0.5, cultivarId: 'tomato' });
    expect(useGardenStore.getState().garden.plantings).toHaveLength(1);
    removeZone(zoneId);
    expect(useGardenStore.getState().garden.zones).toHaveLength(0);
    expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
  });

  it('adds a planting', () => {
    const { addZone, addPlanting } = useGardenStore.getState();
    addZone({ x: 0, y: 0, width: 3, height: 3 });
    const zoneId = useGardenStore.getState().garden.zones[0].id;
    addPlanting({ parentId: zoneId, x: 1, y: 1, cultivarId: 'basil' });
    const p = useGardenStore.getState().garden.plantings[0];
    expect(p.cultivarId).toBe('basil');
    expect(p.parentId).toBe(zoneId);
  });

  it('rejects addStructure when it would collide', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    addStructure({ type: 'raised-bed', x: 2, y: 2, width: 4, height: 4 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
  });

  it('allows addStructure when no collision', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    addStructure({ type: 'raised-bed', x: 5, y: 0, width: 4, height: 4 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(2);
  });

  it('allows placing a structure on a surface', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'patio', x: 0, y: 0, width: 8, height: 8 });
    addStructure({ type: 'pot', x: 2, y: 2, width: 1, height: 1 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(2);
  });

  describe('rearrangePlantings', () => {
    it('rearranges plantings when adding to a container', () => {
      const { addStructure, addPlanting } = useGardenStore.getState();
      addStructure({ type: 'raised-bed', x: 0, y: 0, width: 6, height: 4 });
      const bedId = useGardenStore.getState().garden.structures[0].id;

      addPlanting({ parentId: bedId, x: 0, y: 0, cultivarId: 'basil' });
      addPlanting({ parentId: bedId, x: 0, y: 0, cultivarId: 'basil' });

      const plantings = useGardenStore.getState().garden.plantings;
      expect(plantings).toHaveLength(2);
      // Plantings should not both be at (0,0) — they should have been rearranged
      const positions = plantings.map((p) => `${p.x},${p.y}`);
      expect(new Set(positions).size).toBe(2);
    });

    it('rearranges plantings when arrangement changes on a structure', () => {
      const { addStructure, addPlanting, commitStructureUpdate } = useGardenStore.getState();
      addStructure({ type: 'raised-bed', x: 0, y: 0, width: 6, height: 4 });
      const bedId = useGardenStore.getState().garden.structures[0].id;

      addPlanting({ parentId: bedId, x: 0, y: 0, cultivarId: 'tomato' });
      addPlanting({ parentId: bedId, x: 0, y: 0, cultivarId: 'tomato' });

      // Switch to single arrangement — only 1 slot, so layout changes
      commitStructureUpdate(bedId, {
        arrangement: { type: 'single' },
      });

      const plantings = useGardenStore.getState().garden.plantings;
      expect(plantings).toHaveLength(2);
      // At least the first planting should be repositioned to the center
      expect(plantings[0].x).toBeCloseTo(3, 0);
      expect(plantings[0].y).toBeCloseTo(2, 0);
    });

    it('rearranges plantings when arrangement changes on a zone', () => {
      const { addZone, addPlanting, commitZoneUpdate } = useGardenStore.getState();
      addZone({ x: 0, y: 0, width: 6, height: 4 });
      const zoneId = useGardenStore.getState().garden.zones[0].id;

      addPlanting({ parentId: zoneId, x: 0, y: 0, cultivarId: 'basil' });
      addPlanting({ parentId: zoneId, x: 0, y: 0, cultivarId: 'basil' });

      commitZoneUpdate(zoneId, {
        arrangement: { type: 'rows', spacingFt: 0.75, itemSpacingFt: 0.75, marginFt: 0.25 },
      });

      const plantings = useGardenStore.getState().garden.plantings;
      const positions = plantings.map((p) => `${p.x},${p.y}`);
      expect(new Set(positions).size).toBe(2);
    });

    it('does not rearrange plantings with free arrangement', () => {
      const { addStructure, addPlanting, commitStructureUpdate } = useGardenStore.getState();
      addStructure({ type: 'raised-bed', x: 0, y: 0, width: 6, height: 4 });
      const bedId = useGardenStore.getState().garden.structures[0].id;

      addPlanting({ parentId: bedId, x: 1.5, y: 1.5, cultivarId: 'tomato' });

      commitStructureUpdate(bedId, {
        arrangement: { type: 'free' },
      });

      // With free arrangement, plants keep their positions from the prior rearrangement
      const plantings = useGardenStore.getState().garden.plantings;
      expect(plantings).toHaveLength(1);
    });
  });

  it('updates garden settings', () => {
    useGardenStore.getState().updateGarden({ name: 'Backyard', widthFt: 40 });
    const { garden } = useGardenStore.getState();
    expect(garden.name).toBe('Backyard');
    expect(garden.widthFt).toBe(40);
    expect(garden.heightFt).toBe(20);
  });

  it('adds a zone with pattern', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 3, height: 3, color: 'transparent', pattern: 'crosshatch' });
    const zone = useGardenStore.getState().garden.zones[0];
    expect(zone.pattern).toBe('crosshatch');
    expect(zone.color).toBe('transparent');
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
      seedStarting: emptySeedStartingState(),
    };
    loadGarden(data);
    expect(useGardenStore.getState().garden.name).toBe('Loaded');
    expect(useGardenStore.getState().garden.gridCellSizeFt).toBe(0.5);
  });

  it('loadGarden backfills seedStarting when missing', () => {
    const legacy = { ...blankGarden() } as any;
    delete legacy.seedStarting;
    useGardenStore.getState().loadGarden(legacy);
    expect(useGardenStore.getState().garden.seedStarting).toEqual(emptySeedStartingState());
  });
});

import { snapshotCultivar } from '../model/collection';
import { getAllCultivars } from '../model/cultivars';

describe('setCollection', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
  });

  it('replaces the collection with the provided value', () => {
    const [a, b] = getAllCultivars();
    const next = [snapshotCultivar(a), snapshotCultivar(b)];
    useGardenStore.getState().setCollection(next);
    expect(useGardenStore.getState().garden.collection.map((c) => c.id)).toEqual([a.id, b.id]);
  });

  it('is undoable', () => {
    const [a] = getAllCultivars();
    useGardenStore.getState().setCollection([snapshotCultivar(a)]);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.collection).toEqual([]);
  });

  it('survives load of a garden missing a collection key', () => {
    const garden = JSON.parse(JSON.stringify(useGardenStore.getState().garden));
    delete garden.collection;
    useGardenStore.getState().loadGarden(garden);
    expect(useGardenStore.getState().garden.collection).toEqual([]);
  });
});

import { instantiatePreset } from '../model/trayCatalog';

describe('seed-starting actions', () => {
  beforeEach(() => useGardenStore.getState().reset());

  it('addTray appends a tray and sets currentTrayId', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    expect(useGardenStore.getState().garden.seedStarting.trays).toHaveLength(1);
  });

  it('removeTray removes the tray and orphan seedlings', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil-genovese');
    useGardenStore.getState().removeTray(tray.id);
    expect(useGardenStore.getState().garden.seedStarting.trays).toHaveLength(0);
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(0);
  });

  it('sowCell creates a seedling and marks slot sown', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 1, 2, 'basil-genovese');
    const t = useGardenStore.getState().garden.seedStarting.trays[0];
    expect(t.slots[1 * t.cols + 2].state).toBe('sown');
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(1);
  });

  it('fillTray fills all empty cells with seedlings', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().fillTray(tray.id, 'basil-genovese');
    const t = useGardenStore.getState().garden.seedStarting.trays[0];
    expect(t.slots.every((s) => s.state === 'sown')).toBe(true);
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(36);
  });

  it('fillTray only fills empty cells when one is already sown', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil-genovese');
    useGardenStore.getState().fillTray(tray.id, 'basil-genovese');
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(36);
    const t = useGardenStore.getState().garden.seedStarting.trays[0];
    expect(t.slots.every((s) => s.state === 'sown')).toBe(true);
  });

  it('fillRow only fills cells in the specified row', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().fillRow(tray.id, 1, 'basil-genovese');
    const t = useGardenStore.getState().garden.seedStarting.trays[0];
    for (let r = 0; r < t.rows; r++) {
      for (let c = 0; c < t.cols; c++) {
        const expected = r === 1 ? 'sown' : 'empty';
        expect(t.slots[r * t.cols + c].state).toBe(expected);
      }
    }
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(t.cols);
  });

  it('fillRow skips already-sown cells', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil-genovese');
    useGardenStore.getState().fillRow(tray.id, 0, 'basil-genovese');
    const t = useGardenStore.getState().garden.seedStarting.trays[0];
    expect(t.slots.slice(0, t.cols).every((s) => s.state === 'sown')).toBe(true);
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(t.cols);
  });

  it('fillRow ignores out-of-bounds row', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().fillRow(tray.id, 99, 'basil-genovese');
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(0);
  });

  it('fillColumn only fills cells in the specified column', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().fillColumn(tray.id, 2, 'basil-genovese');
    const t = useGardenStore.getState().garden.seedStarting.trays[0];
    for (let r = 0; r < t.rows; r++) {
      for (let c = 0; c < t.cols; c++) {
        const expected = c === 2 ? 'sown' : 'empty';
        expect(t.slots[r * t.cols + c].state).toBe(expected);
      }
    }
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(t.rows);
  });

  it('fillColumn ignores out-of-bounds column', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().fillColumn(tray.id, 99, 'basil-genovese');
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(0);
  });

  it('moveSeedling moves a seedling into an empty cell', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil-genovese');
    const sId = useGardenStore.getState().garden.seedStarting.seedlings[0].id;
    useGardenStore.getState().moveSeedling(tray.id, 0, 0, 1, 2);
    const t = useGardenStore.getState().garden.seedStarting.trays[0];
    expect(t.slots[0 * t.cols + 0].state).toBe('empty');
    const dest = t.slots[1 * t.cols + 2];
    expect(dest.state).toBe('sown');
    expect(dest.seedlingId).toBe(sId);
    const seedling = useGardenStore.getState().garden.seedStarting.seedlings[0];
    expect(seedling.row).toBe(1);
    expect(seedling.col).toBe(2);
  });

  it('moveSeedling swaps two occupied cells', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil-genovese');
    useGardenStore.getState().sowCell(tray.id, 1, 1, 'basil-genovese');
    const before = useGardenStore.getState().garden.seedStarting.trays[0];
    const idA = before.slots[0 * before.cols + 0].seedlingId;
    const idB = before.slots[1 * before.cols + 1].seedlingId;
    useGardenStore.getState().moveSeedling(tray.id, 0, 0, 1, 1);
    const after = useGardenStore.getState().garden.seedStarting.trays[0];
    expect(after.slots[0 * after.cols + 0].seedlingId).toBe(idB);
    expect(after.slots[1 * after.cols + 1].seedlingId).toBe(idA);
  });

  it('moveSeedling is a no-op when source is empty', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().moveSeedling(tray.id, 0, 0, 1, 1);
    const t = useGardenStore.getState().garden.seedStarting.trays[0];
    expect(t.slots[0].state).toBe('empty');
    expect(t.slots[t.cols + 1].state).toBe('empty');
  });

  it('clearCell removes the seedling and resets slot', () => {
    const tray = instantiatePreset('1020-36')!;
    useGardenStore.getState().addTray(tray);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil-genovese');
    useGardenStore.getState().clearCell(tray.id, 0, 0);
    const t = useGardenStore.getState().garden.seedStarting.trays[0];
    expect(t.slots[0].state).toBe('empty');
    expect(useGardenStore.getState().garden.seedStarting.seedlings).toHaveLength(0);
  });
});
