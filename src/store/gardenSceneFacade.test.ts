import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGarden, DEFAULT_WALL_THICKNESS_FT } from '../model/types';
import { deserializeGarden, serializeGarden } from '../utils/file';
import { blankGarden, useGardenStore } from './gardenStore';

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

      // Parse the serialized output as raw JSON rather than going through
      // deserializeGarden again. deserializeGarden re-runs snapPlantingsToCellGrid,
      // which is a load-time migration that isn't idempotent when applied twice to
      // already-snapped coordinates. The raw JSON from serializeGarden faithfully
      // reflects what the scene preserved, which is what we want to compare.
      const savedRaw = JSON.parse(serializeGarden(useGardenStore.getState().garden)) as {
        structures: typeof loaded.structures;
        zones: typeof loaded.zones & Array<Record<string, unknown>>;
        plantings: typeof loaded.plantings;
        nursery: typeof loaded.nursery;
        name: string;
        widthFt: number;
        lengthFt: number;
        collection: Array<{ id: string }>;
      };

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

      // Project zones to the canonical Zone fields only — older fixtures may
      // carry legacy fields (e.g. `arrangement`) that aren't in the Zone model
      // and that the scene round-trip correctly drops.
      const projZone = (zs: Array<Record<string, unknown>>) =>
        [...zs]
          .sort((a, b) => (a.id as string).localeCompare(b.id as string))
          .map(
            ({
              id,
              x,
              y,
              width,
              length,
              color,
              label,
              zIndex,
              parentId,
              soilType,
              sunExposure,
              layout,
              pattern,
            }) => ({
              id,
              x,
              y,
              width,
              length,
              color,
              label,
              zIndex,
              parentId,
              soilType,
              sunExposure,
              layout,
              pattern,
            }),
          );

      expect(normStructures(savedRaw.structures)).toEqual(normStructures(loaded.structures));
      expect(projZone(savedRaw.zones as unknown as Array<Record<string, unknown>>)).toEqual(
        projZone(loaded.zones as unknown as Array<Record<string, unknown>>),
      );
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
