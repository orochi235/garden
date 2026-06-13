import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Garden, Structure, Zone } from '../model/types';
import { deserializeGarden } from '../utils/file';
import { gardenToScene, sceneToGarden, splitBase } from './gardenConverters';
import { createGardenScene } from './gardenScene';

const FIXTURES = ['default', 'marinara', 'salsa', 'eight-tomatoes', 'trellis-bed'];

const sortById = <T extends { id: string }>(xs: T[]): T[] =>
  [...xs].sort((a, b) => a.id.localeCompare(b.id));

/**
 * Project a Structure to the fields the current type models.
 * Older .garden files contain legacy fields (arrangement, trellisEdge, pattern) that
 * are not in the Structure type and are not carried through the Scene — they need a
 * deserializeGarden migration to be stripped. Until then we compare only typed fields.
 */
const projStructure = (s: Structure) => ({
  id: s.id,
  type: s.type,
  shape: s.shape,
  x: s.x,
  y: s.y,
  width: s.width,
  length: s.length,
  rotation: s.rotation,
  color: s.color,
  label: s.label,
  zIndex: s.zIndex,
  parentId: s.parentId,
  groupId: s.groupId ?? null,
  snapToGrid: s.snapToGrid,
  surface: s.surface,
  container: s.container,
  fill: s.fill ?? null,
  layout: s.layout ?? null,
  wallThicknessFt: s.wallThicknessFt ?? 0,
  clipChildren: s.clipChildren ?? true,
});

const projZone = (z: Zone) => ({
  id: z.id,
  x: z.x,
  y: z.y,
  width: z.width,
  length: z.length,
  color: z.color,
  label: z.label,
  zIndex: z.zIndex,
  parentId: z.parentId,
  soilType: z.soilType,
  sunExposure: z.sunExposure,
  layout: z.layout ?? null,
  pattern: z.pattern,
});

const projPlanting = (ps: Garden['plantings']) =>
  sortById(ps).map((p) => ({
    id: p.id,
    parentId: p.parentId,
    cultivarId: p.cultivarId,
    x: p.x,
    y: p.y,
    label: p.label,
    icon: p.icon,
  }));

describe('gardenToScene/sceneToGarden fixture parity', () => {
  for (const name of FIXTURES) {
    it(`round-trips public/${name}.garden`, () => {
      const json = readFileSync(join(process.cwd(), 'public', `${name}.garden`), 'utf8');
      const g = deserializeGarden(json);
      const out = sceneToGarden(createGardenScene(gardenToScene(g)), splitBase(g));
      expect(sortById(out.structures).map(projStructure)).toEqual(
        sortById(g.structures).map(projStructure),
      );
      expect(sortById(out.zones).map(projZone)).toEqual(sortById(g.zones).map(projZone));
      expect(projPlanting(out.plantings)).toEqual(projPlanting(g.plantings));
    });
  }
});
