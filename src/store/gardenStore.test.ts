import { beforeEach, describe, expect, it } from 'vitest';
import { emptySeedStartingState } from '../model/seedStarting';
import { blankGarden, useGardenStore } from './gardenStore';
import { useUiStore } from './uiStore';

describe('gardenStore', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('initializes with a default garden', () => {
    const { garden } = useGardenStore.getState();
    expect(garden.name).toBe('My Garden');
    expect(garden.widthFt).toBe(20);
    expect(garden.lengthFt).toBe(20);
    expect(garden.structures).toEqual([]);
    expect(garden.zones).toEqual([]);
    expect(garden.plantings).toEqual([]);
  });

  it('adds a structure', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 8 });
    const { garden } = useGardenStore.getState();
    expect(garden.structures).toHaveLength(1);
    expect(garden.structures[0].type).toBe('raised-bed');
  });

  it('removes a structure', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'pot', x: 1, y: 1, width: 2, length: 2 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useGardenStore.getState().removeStructure(id);
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('updates a structure', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 8 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useGardenStore.getState().updateStructure(id, { label: 'Herbs', x: 5 });
    const s = useGardenStore.getState().garden.structures[0];
    expect(s.label).toBe('Herbs');
    expect(s.x).toBe(5);
    expect(s.width).toBe(4);
  });

  it('adds a zone', () => {
    const { addZone } = useGardenStore.getState();
    addZone({ x: 0, y: 0, width: 3, length: 3 });
    expect(useGardenStore.getState().garden.zones).toHaveLength(1);
  });

  it('removes a zone and its plantings', () => {
    const { addZone, addPlanting, removeZone } = useGardenStore.getState();
    addZone({ x: 0, y: 0, width: 3, length: 3 });
    const zoneId = useGardenStore.getState().garden.zones[0].id;
    addPlanting({ parentId: zoneId, x: 0.5, y: 0.5, cultivarId: 'tomato' });
    expect(useGardenStore.getState().garden.plantings).toHaveLength(1);
    removeZone(zoneId);
    expect(useGardenStore.getState().garden.zones).toHaveLength(0);
    expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
  });

  it('adds a planting', () => {
    const { addZone, addPlanting } = useGardenStore.getState();
    addZone({ x: 0, y: 0, width: 3, length: 3 });
    const zoneId = useGardenStore.getState().garden.zones[0].id;
    addPlanting({ parentId: zoneId, x: 1, y: 1, cultivarId: 'basil' });
    const p = useGardenStore.getState().garden.plantings[0];
    expect(p.cultivarId).toBe('basil');
    expect(p.parentId).toBe(zoneId);
  });

  it('rejects addStructure when it would collide', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    addStructure({ type: 'raised-bed', x: 2, y: 2, width: 4, length: 4 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
  });

  it('allows addStructure when no collision', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    addStructure({ type: 'raised-bed', x: 5, y: 0, width: 4, length: 4 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(2);
  });

  it('allows placing a structure on a surface', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'patio', x: 0, y: 0, width: 8, length: 8 });
    addStructure({ type: 'pot', x: 2, y: 2, width: 1, length: 1 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(2);
  });

  describe('rearrangePlantings', () => {
    it('rearranges plantings when adding to a container', () => {
      const { addStructure, addPlanting } = useGardenStore.getState();
      addStructure({ type: 'raised-bed', x: 0, y: 0, width: 6, length: 4 });
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
      addStructure({ type: 'raised-bed', x: 0, y: 0, width: 6, length: 4 });
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
      addZone({ x: 0, y: 0, width: 6, length: 4 });
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
      addStructure({ type: 'raised-bed', x: 0, y: 0, width: 6, length: 4 });
      const bedId = useGardenStore.getState().garden.structures[0].id;

      addPlanting({ parentId: bedId, x: 1.5, y: 1.5, cultivarId: 'tomato' });

      commitStructureUpdate(bedId, {
        arrangement: { type: 'free' },
      });

      // With free arrangement, plants keep their positions from the prior rearrangement
      const plantings = useGardenStore.getState().garden.plantings;
      expect(plantings).toHaveLength(1);
    });

    it('skipRearrange preserves explicit local coords when reparenting', () => {
      // Two beds side by side; move planting from bed1 to bed2 with explicit
      // local coords. Without skipRearrange, rearrangePlantings would overwrite
      // those coords with the next available slot.
      const { addStructure, addPlanting, updatePlanting } = useGardenStore.getState();
      addStructure({ type: 'raised-bed', x: 0, y: 0, width: 6, length: 4 });
      addStructure({ type: 'raised-bed', x: 10, y: 0, width: 6, length: 4 });
      const [bed1, bed2] = useGardenStore.getState().garden.structures;

      addPlanting({ parentId: bed1.id, x: 0, y: 0, cultivarId: 'tomato' });
      const plantingId = useGardenStore.getState().garden.plantings[0].id;

      // Reparent with explicit coords via skipRearrange.
      updatePlanting(plantingId, { parentId: bed2.id, x: 2.5, y: 1.5 }, { skipRearrange: true });

      const p = useGardenStore.getState().garden.plantings.find((pl) => pl.id === plantingId)!;
      expect(p.parentId).toBe(bed2.id);
      // Explicit coords must survive — rearrangePlantings must NOT have run.
      expect(p.x).toBe(2.5);
      expect(p.y).toBe(1.5);
    });
  });

  it('updates garden settings', () => {
    useGardenStore.getState().updateGarden({ name: 'Backyard', widthFt: 40 });
    const { garden } = useGardenStore.getState();
    expect(garden.name).toBe('Backyard');
    expect(garden.widthFt).toBe(40);
    expect(garden.lengthFt).toBe(20);
  });

  it('adds a zone with pattern', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 3, length: 3, color: 'transparent', pattern: 'crosshatch' });
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
      lengthFt: 25,
      gridCellSizeFt: 0.5,
      displayUnit: 'ft' as const,
      blueprint: null,
      groundColor: '#4a7c59',
      structures: [],
      zones: [],
      plantings: [],
      seedStarting: emptySeedStartingState(),
      collection: [],
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

  it('is not in undo (collection is catalog-level, not garden state)', () => {
    const [a] = getAllCultivars();
    useGardenStore.getState().setCollection([snapshotCultivar(a)]);
    useGardenStore.getState().undo();
    // Collection persists across undo — it isn't part of the garden timeline.
    expect(useGardenStore.getState().garden.collection).toHaveLength(1);
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

  describe('reorderTrays', () => {
    function seedThreeTrays() {
      const a = { ...instantiatePreset('1020-36')!, id: 'tray-a', label: 'A' };
      const b = { ...instantiatePreset('1020-36')!, id: 'tray-b', label: 'B' };
      const c = { ...instantiatePreset('1020-36')!, id: 'tray-c', label: 'C' };
      useGardenStore.getState().addTray(a);
      useGardenStore.getState().addTray(b);
      useGardenStore.getState().addTray(c);
      return [a, b, c] as const;
    }

    it('moves a tray from one index to another', () => {
      seedThreeTrays();
      useGardenStore.getState().reorderTrays(0, 2);
      const ids = useGardenStore.getState().garden.seedStarting.trays.map((t) => t.id);
      expect(ids).toEqual(['tray-b', 'tray-c', 'tray-a']);
    });

    it('moves a tray backwards', () => {
      seedThreeTrays();
      useGardenStore.getState().reorderTrays(2, 0);
      const ids = useGardenStore.getState().garden.seedStarting.trays.map((t) => t.id);
      expect(ids).toEqual(['tray-c', 'tray-a', 'tray-b']);
    });

    it('no-ops when fromIndex === toIndex', () => {
      seedThreeTrays();
      const before = useGardenStore.getState().garden.seedStarting.trays;
      useGardenStore.getState().reorderTrays(1, 1);
      expect(useGardenStore.getState().garden.seedStarting.trays).toBe(before);
    });

    it('no-ops on out-of-bounds indices', () => {
      seedThreeTrays();
      const before = useGardenStore.getState().garden.seedStarting.trays;
      useGardenStore.getState().reorderTrays(-1, 1);
      useGardenStore.getState().reorderTrays(0, 99);
      useGardenStore.getState().reorderTrays(5, 0);
      expect(useGardenStore.getState().garden.seedStarting.trays).toBe(before);
    });

    it('creates exactly one undo step', () => {
      seedThreeTrays();
      const idsBefore = useGardenStore.getState().garden.seedStarting.trays.map((t) => t.id);
      useGardenStore.getState().reorderTrays(0, 2);
      expect(useGardenStore.getState().garden.seedStarting.trays.map((t) => t.id)).toEqual([
        'tray-b',
        'tray-c',
        'tray-a',
      ]);
      useGardenStore.getState().undo();
      expect(useGardenStore.getState().garden.seedStarting.trays.map((t) => t.id)).toEqual(idsBefore);
    });
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

  describe('moveSeedlingsAcrossTrays', () => {
    function setupTwoTrays() {
      const a = { ...instantiatePreset('1020-36')!, id: 'tray-a', label: 'A' };
      const b = { ...instantiatePreset('1020-36')!, id: 'tray-b', label: 'B' };
      useGardenStore.getState().addTray(a);
      useGardenStore.getState().addTray(b);
      return [a, b] as const;
    }

    it('moves a seedling from tray A to tray B in one undo step', () => {
      const [a, b] = setupTwoTrays();
      useGardenStore.getState().sowCell(a.id, 0, 0, 'basil-genovese');
      const sId = useGardenStore.getState().garden.seedStarting.seedlings[0].id;

      useGardenStore.getState().moveSeedlingsAcrossTrays([
        { seedlingId: sId, fromTrayId: a.id, toTrayId: b.id, toRow: 1, toCol: 2 },
      ]);

      const ss = useGardenStore.getState().garden.seedStarting;
      const trayA = ss.trays.find((t) => t.id === a.id)!;
      const trayB = ss.trays.find((t) => t.id === b.id)!;
      expect(trayA.slots[0].state).toBe('empty');
      expect(trayB.slots[1 * trayB.cols + 2].state).toBe('sown');
      expect(trayB.slots[1 * trayB.cols + 2].seedlingId).toBe(sId);
      const moved = ss.seedlings.find((s) => s.id === sId)!;
      expect(moved.trayId).toBe(b.id);
      expect(moved.row).toBe(1);
      expect(moved.col).toBe(2);

      // Single undo restores everything.
      useGardenStore.getState().undo();
      const ss2 = useGardenStore.getState().garden.seedStarting;
      expect(ss2.trays.find((t) => t.id === a.id)!.slots[0].state).toBe('sown');
      expect(ss2.trays.find((t) => t.id === b.id)!.slots[1 * b.cols + 2].state).toBe('empty');
      const restored = ss2.seedlings.find((s) => s.id === sId)!;
      expect(restored.trayId).toBe(a.id);
      expect(restored.row).toBe(0);
      expect(restored.col).toBe(0);
    });

    it('rejects the batch when a destination cell is occupied by a non-mover', () => {
      const [a, b] = setupTwoTrays();
      useGardenStore.getState().sowCell(a.id, 0, 0, 'basil-genovese');
      useGardenStore.getState().sowCell(b.id, 1, 2, 'basil-genovese'); // occupies dest
      const sId = useGardenStore.getState().garden.seedStarting.seedlings.find(
        (s) => s.trayId === a.id,
      )!.id;
      const before = useGardenStore.getState().garden.seedStarting;

      useGardenStore.getState().moveSeedlingsAcrossTrays([
        { seedlingId: sId, fromTrayId: a.id, toTrayId: b.id, toRow: 1, toCol: 2 },
      ]);

      // Whole batch rejected — state unchanged.
      const after = useGardenStore.getState().garden.seedStarting;
      expect(after).toBe(before);
    });

    it('handles a within-tray move (toTrayId === fromTrayId)', () => {
      const [a] = setupTwoTrays();
      useGardenStore.getState().sowCell(a.id, 0, 0, 'basil-genovese');
      const sId = useGardenStore.getState().garden.seedStarting.seedlings[0].id;
      useGardenStore.getState().moveSeedlingsAcrossTrays([
        { seedlingId: sId, fromTrayId: a.id, toTrayId: a.id, toRow: 1, toCol: 1 },
      ]);
      const trayA = useGardenStore.getState().garden.seedStarting.trays.find((t) => t.id === a.id)!;
      expect(trayA.slots[0].state).toBe('empty');
      expect(trayA.slots[1 * trayA.cols + 1].seedlingId).toBe(sId);
    });

    it('no-ops when the only move is already at its target', () => {
      const [a, b] = setupTwoTrays();
      useGardenStore.getState().sowCell(a.id, 0, 0, 'basil-genovese');
      const sId = useGardenStore.getState().garden.seedStarting.seedlings[0].id;
      const before = useGardenStore.getState().garden.seedStarting;
      useGardenStore.getState().moveSeedlingsAcrossTrays([
        { seedlingId: sId, fromTrayId: a.id, toTrayId: a.id, toRow: 0, toCol: 0 },
      ]);
      void b;
      // No change → no commit.
      expect(useGardenStore.getState().garden.seedStarting).toBe(before);
    });

    it('rejects out-of-bounds destinations', () => {
      const [a, b] = setupTwoTrays();
      useGardenStore.getState().sowCell(a.id, 0, 0, 'basil-genovese');
      const sId = useGardenStore.getState().garden.seedStarting.seedlings[0].id;
      const before = useGardenStore.getState().garden.seedStarting;
      useGardenStore.getState().moveSeedlingsAcrossTrays([
        { seedlingId: sId, fromTrayId: a.id, toTrayId: b.id, toRow: 99, toCol: 99 },
      ]);
      expect(useGardenStore.getState().garden.seedStarting).toBe(before);
    });
  });
});

describe('selection rides on history', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  it('undo restores the selection that was active before the change', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 4, length: 4 });
    const z1 = useGardenStore.getState().garden.zones[0].id;
    useUiStore.getState().setSelection([z1]);
    // Add a second zone with z1 selected at checkpoint time.
    useGardenStore.getState().addZone({ x: 5, y: 5, width: 4, length: 4 });
    useUiStore.getState().setSelection([]); // simulate a click clearing selection
    useGardenStore.getState().undo();
    // Undo restores selection to whatever it was when the second add was checkpointed.
    expect(useUiStore.getState().selectedIds).toEqual([z1]);
  });

  it('redo restores the selection that was active just before undo', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 4, length: 4 });
    const z1 = useGardenStore.getState().garden.zones[0].id;
    useUiStore.getState().setSelection([z1]);
    useGardenStore.getState().addZone({ x: 5, y: 5, width: 4, length: 4 });
    const z2 = useGardenStore.getState().garden.zones[1].id;
    useUiStore.getState().setSelection([z2]);
    useGardenStore.getState().undo();
    useGardenStore.getState().redo();
    expect(useUiStore.getState().selectedIds).toEqual([z2]);
  });

  it('scrubs selection ids that no longer exist in the restored garden', () => {
    // Simulate the paste-then-undo bug: selection should never reference a deleted object.
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 4, length: 4 });
    const z1 = useGardenStore.getState().garden.zones[0].id;
    // Add a second zone, then select it. Selection at the checkpoint of the *next*
    // change will include z2.
    useGardenStore.getState().addZone({ x: 5, y: 5, width: 4, length: 4 });
    const z2 = useGardenStore.getState().garden.zones[1].id;
    useUiStore.getState().setSelection([z2]);
    // Remove z2 (commitPatch snapshots {garden has z1+z2, sel=[z2]}).
    useGardenStore.getState().removeZone(z2);
    // Selection still has the now-deleted id (delete action would normally clear it,
    // but other flows may leave it). Verify the scrub kicks in on undo/redo too.
    useUiStore.getState().setSelection([z2]);
    useGardenStore.getState().undo();
    // After undo, garden has z2 again; selection [z2] is valid and preserved.
    expect(useGardenStore.getState().garden.zones.map((z) => z.id)).toContain(z2);
    expect(useUiStore.getState().selectedIds).toEqual([z2]);
    // Redo: garden loses z2; selection snapshot was [z2] but that id is no longer live.
    useGardenStore.getState().redo();
    expect(useGardenStore.getState().garden.zones.map((z) => z.id)).not.toContain(z2);
    expect(useUiStore.getState().selectedIds).not.toContain(z2);
    expect(useUiStore.getState().selectedIds).toEqual([]);
    void z1;
  });

  it('cut via insert adapter removes originals and is a single undoable batch', async () => {
    // TDD: cut = snapshot + delete in one applyBatch call (single history entry).
    // Undoing cut restores both the zone and the prior selection.
    const { createInsertAdapter } = await import('../canvas/adapters/insert');
    const { createDeleteOp, createSetSelectionOp } = await import('@orochi235/weasel');

    useGardenStore.getState().addZone({ x: 0, y: 0, width: 4, length: 4 });
    const z1 = useGardenStore.getState().garden.zones[0].id;
    useUiStore.getState().setSelection([z1]);

    const adapter = createInsertAdapter();
    // Snapshot the zone before deleting it (mirrors weasel useClipboard.cut).
    // The snapshot would normally be stored in clipboard state; here we only
    // test the delete side of the cut (the undo behavior).
    adapter.snapshotSelection([z1]);
    const ids = [z1];
    const cutOps = [
      ...ids.map((id) => createDeleteOp({ object: adapter.getObject(id)! })),
      createSetSelectionOp({ from: ids, to: [] }),
    ];
    adapter.applyBatch!(cutOps, 'Cut');

    // Zone is gone, selection cleared.
    expect(useGardenStore.getState().garden.zones).toHaveLength(0);
    expect(useUiStore.getState().selectedIds).toEqual([]);

    // Single undo step restores both the zone and the selection.
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.zones).toHaveLength(1);
    expect(useGardenStore.getState().garden.zones[0].id).toBe(z1);
    expect(useUiStore.getState().selectedIds).toEqual([z1]);
  });

  it('paste-then-undo via insert adapter does not leave stale ids selected', async () => {
    // End-to-end coverage of the original bug: undoing a paste leaves the
    // (now-deleted) pasted ids selected. Routes through the same applyBatch
    // path the weasel clipboard uses.
    const { createInsertAdapter } = await import('../canvas/adapters/insert');
    const { createInsertOp, createSetSelectionOp } = await import('@orochi235/weasel');

    useGardenStore.getState().addZone({ x: 0, y: 0, width: 4, length: 4 });
    const z1 = useGardenStore.getState().garden.zones[0].id;
    useUiStore.getState().setSelection([z1]);

    // Simulate a paste: snapshot z1, materialize a sibling, then setSelection
    // to the new id — exactly what the weasel clipboard hook emits.
    const adapter = createInsertAdapter();
    const snap = adapter.snapshotSelection([z1]);
    const [pasted] = adapter.commitPaste(snap, { dx: 1, dy: 1 });
    adapter.applyBatch!(
      [createInsertOp({ object: pasted }), createSetSelectionOp({ from: [z1], to: [pasted.id] })],
      'Paste',
    );
    expect(useGardenStore.getState().garden.zones).toHaveLength(2);
    expect(useUiStore.getState().selectedIds).toEqual([pasted.id]);

    // Undo: garden loses the pasted zone, selection should restore to [z1]
    // (what was selected at checkpoint time) — never reference the deleted id.
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.zones).toHaveLength(1);
    expect(useUiStore.getState().selectedIds).not.toContain(pasted.id);
    expect(useUiStore.getState().selectedIds).toEqual([z1]);
  });

  it('applyOptimizerResult places plantings at correct world coords and is undoable', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 8 });
    const bedId = useGardenStore.getState().garden.structures[0].id;
    // Verify no plantings exist yet
    expect(useGardenStore.getState().garden.plantings).toHaveLength(0);

    const candidate: import('../optimizer').OptimizationCandidate = {
      placements: [
        { cultivarId: 'tomato', xIn: 12, yIn: 12 }, // 1ft, 1ft from bed origin
        { cultivarId: 'basil', xIn: 24, yIn: 24 },  // 2ft, 2ft from bed origin
      ],
      score: 10,
      reason: 'test',
      gap: 0,
      solveMs: 100,
    };

    useGardenStore.getState().applyOptimizerResult(bedId, candidate);
    const { plantings } = useGardenStore.getState().garden;
    expect(plantings).toHaveLength(2);

    const tomato = plantings.find((p) => p.cultivarId === 'tomato')!;
    expect(tomato.x).toBeCloseTo(0 + 12 / 12, 5); // bed.x + 1ft
    expect(tomato.y).toBeCloseTo(0 + 12 / 12, 5);

    // Undo should revert to 0 plantings
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
  });
});

describe('collection orphan tolerance', () => {
  it('plantings whose cultivar is not in the collection still resolve via the database', () => {
    const [a] = getAllCultivars();
    useGardenStore.getState().reset();
    useGardenStore.setState((s) => ({
      garden: {
        ...s.garden,
        plantings: [{ id: 'p1', parentId: 'parent', cultivarId: a.id, x: 0, y: 0, label: '', icon: null }],
        collection: [],
      },
    }));
    expect(useGardenStore.getState().garden.plantings[0].cultivarId).toBe(a.id);
    expect(useGardenStore.getState().garden.collection).toEqual([]);
  });
});
