import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTray } from '../model/nursery';
import { createGarden, DEFAULT_WALL_THICKNESS_FT } from '../model/types';
import { deserializeGarden, serializeGarden } from '../utils/file';
import { blankGarden, useGardenStore } from './gardenStore';
import { useUiStore } from './uiStore';

describe('gardenStore scene-backed facade', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('exposes a Garden composed from the scene after loadGarden', () => {
    const g = createGarden({ name: 'Loaded', widthFt: 12, lengthFt: 9 });
    g.structures = [
      {
        id: 's1',
        type: 'raised-bed',
        shape: 'rectangle',
        x: 1,
        y: 1,
        width: 4,
        length: 8,
        rotation: 0,
        color: '#aaa',
        label: 'Bed',
        zIndex: 0,
        parentId: null,
        groupId: null,
        snapToGrid: true,
        surface: false,
        container: true,
        fill: null,
        layout: null,
        wallThicknessFt: 0.5,
        clipChildren: false,
      },
    ];
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

describe('store round-trip: .garden -> loadGarden(scene) -> serialize', () => {
  /**
   * Apply the same defaults that backfillGarden applies to structures, so we
   * can compare the pre-backfill `loaded` garden to the post-backfill `saved`
   * garden without false mismatches. Applied symmetrically to both sides.
   */
  function normalizeStructure(s: Record<string, unknown>): Record<string, unknown> {
    return {
      ...s,
      wallThicknessFt:
        s.wallThicknessFt != null
          ? s.wallThicknessFt
          : (DEFAULT_WALL_THICKNESS_FT[s.type as string] ?? 0),
      groupId: s.groupId !== undefined ? s.groupId : null,
      clipChildren: s.clipChildren !== undefined ? s.clipChildren : true,
    };
  }

  for (const name of ['default', 'marinara', 'salsa', 'eight-tomatoes', 'trellis-bed']) {
    it(`round-trips public/${name}.garden through the scene-backed store`, () => {
      const json = readFileSync(join(process.cwd(), 'public', `${name}.garden`), 'utf8');
      const loaded = deserializeGarden(json);
      useGardenStore.getState().loadGarden(loaded);

      // Full disk round-trip: serialize the scene-backed garden and read it back.
      // The new scene-native format reconstructs spatial arrays via sceneToGarden
      // (it does NOT re-run snapPlantingsToCellGrid), so the round-trip is
      // idempotent and faithfully reflects what the scene preserved.
      const savedRaw = deserializeGarden(serializeGarden(useGardenStore.getState().garden));

      const sortById = <T extends { id: string }>(xs: T[]) =>
        [...xs].sort((a, b) => a.id.localeCompare(b.id));

      const projPlant = (ps: typeof loaded.plantings) =>
        sortById(ps).map((p) => ({
          id: p.id,
          parentId: p.parentId,
          cultivarId: p.cultivarId,
          x: p.x,
          y: p.y,
          label: p.label,
          icon: p.icon,
        }));

      const normStructures = (ss: typeof loaded.structures) =>
        sortById(ss).map((s) => normalizeStructure(s as unknown as Record<string, unknown>));

      expect(normStructures(savedRaw.structures)).toEqual(normStructures(loaded.structures));
      // Full zone equality: legacy `arrangement` is now stripped at load time
      // so zones are clean by the time they reach the scene.
      expect(sortById(savedRaw.zones)).toEqual(sortById(loaded.zones));
      expect(projPlant(savedRaw.plantings)).toEqual(projPlant(loaded.plantings));
      expect(savedRaw.nursery).toEqual(loaded.nursery);
      expect(savedRaw.name).toBe(loaded.name);
      expect(savedRaw.widthFt).toBe(loaded.widthFt);
      expect(savedRaw.lengthFt).toBe(loaded.lengthFt);
      expect(savedRaw.collection.map((c) => c.id).sort()).toEqual(
        loaded.collection.map((c) => c.id).sort(),
      );
    });
  }
});

describe('nursery scene-backed facade', () => {
  beforeEach(() => {
    useUiStore.getState().setAppMode('garden');
    useGardenStore.getState().reset();
  });

  it('getNurseryScene returns a stable instance across nursery edits', () => {
    const s1 = useGardenStore.getState().getNurseryScene();
    useGardenStore
      .getState()
      .addTray(createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 'A' }));
    const s2 = useGardenStore.getState().getNurseryScene();
    expect(s2).toBe(s1);
  });

  it('addTray surfaces through garden.nursery (composed from the scene)', () => {
    useGardenStore
      .getState()
      .addTray(createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 'A' }));
    const trays = useGardenStore.getState().garden.nursery.trays;
    expect(trays.map((t) => t.label)).toContain('A');
  });

  it('nursery undo restores prior state and does not touch garden', () => {
    const store = useGardenStore.getState();
    const beforeStructures = store.garden.structures.length;
    // Nursery undo only fires in nursery mode (see undo()'s appMode branch).
    useUiStore.getState().setAppMode('nursery');
    store.addTray(createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 'A' }));
    expect(useGardenStore.getState().garden.nursery.trays).toHaveLength(1);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.nursery.trays).toHaveLength(0);
    expect(useGardenStore.getState().garden.structures.length).toBe(beforeStructures);
  });

  it('reorderTrays reflows tray order through the scene', () => {
    const store = useGardenStore.getState();
    store.addTray(createTray({ rows: 1, cols: 1, cellSize: 'medium', label: 'A' }));
    store.addTray(createTray({ rows: 1, cols: 1, cellSize: 'medium', label: 'B' }));
    useGardenStore.getState().reorderTrays(0, 1);
    expect(useGardenStore.getState().garden.nursery.trays.map((t) => t.label)).toEqual(['B', 'A']);
  });
});
