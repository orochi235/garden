import { describe, expect, it } from 'vitest';
import { buildPlantRows } from './plantsViewModel';
import { createGarden, createStructure, createPlanting } from '../../model/types';
import { getAllCultivars } from '../../model/cultivars';

function gardenWithOnePlanting() {
  const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
  const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
  bed.label = 'Bed A';
  garden.structures.push(bed);
  const cv = getAllCultivars()[0];
  const planting = createPlanting({ parentId: bed.id, x: 1, y: 1, cultivarId: cv.id });
  garden.plantings.push(planting);
  return { garden, bed, planting, cv };
}

describe('buildPlantRows', () => {
  it('emits a row for each planting with kind="planting"', () => {
    const { garden, planting, bed, cv } = gardenWithOnePlanting();
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe(planting.id);
    expect(row.kind).toBe('planting');
    expect(row.cultivarId).toBe(cv.id);
    expect(row.parentId).toBe(bed.id);
    expect(row.location).toBe('Bed A');
    expect(row.stage).toBe('planted');
    expect(row.name).toBe(cv.name);
    expect(row.x).toBe(1);
    expect(row.y).toBe(1);
  });

  it('falls back to cultivarId for missing cultivar but still emits row', () => {
    const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    garden.structures.push(bed);
    garden.plantings.push({
      id: 'p1', parentId: bed.id, cultivarId: 'does-not-exist',
      x: 0, y: 0, label: 'x', icon: null,
    });
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('does-not-exist');
    expect(rows[0].variety).toBeNull();
  });

  it('resolves zone label as location when parent is a zone', () => {
    const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    const zone = { id: 'z1', x: 0, y: 0, width: 5, length: 5, color: '#fff',
      label: 'Zone X', zIndex: 0, parentId: null, soilType: null, sunExposure: null,
      layout: null, pattern: null };
    garden.zones.push(zone);
    const cv = getAllCultivars()[0];
    garden.plantings.push(createPlanting({ parentId: 'z1', x: 0, y: 0, cultivarId: cv.id }));
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows[0].location).toBe('Zone X');
  });

  it('uses "—" when parent cannot be found', () => {
    const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    const cv = getAllCultivars()[0];
    garden.plantings.push(createPlanting({ parentId: 'ghost', x: 0, y: 0, cultivarId: cv.id }));
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows[0].location).toBe('—');
  });

  it('emits a row per seedling with kind="seedling" and tray label as location', () => {
    const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    const cv = getAllCultivars()[0];
    garden.seedStarting.trays.push({
      id: 'tray1', label: 'Tray North', rows: 2, cols: 2,
      cellSize: 'medium', cellPitchIn: 1.5, widthIn: 10, heightIn: 10,
      slots: [
        { state: 'sown', seedlingId: 's1' },
        { state: 'empty', seedlingId: null },
        { state: 'empty', seedlingId: null },
        { state: 'empty', seedlingId: null },
      ],
    });
    garden.seedStarting.seedlings.push({
      id: 's1', cultivarId: cv.id, trayId: 'tray1',
      row: 0, col: 0, labelOverride: null,
    });
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('seedling');
    expect(rows[0].id).toBe('s1');
    expect(rows[0].stage).toBe('seedling');
    expect(rows[0].location).toBe('Tray North');
    expect(rows[0].x).toBeNull();
    expect(rows[0].y).toBeNull();
  });

  it('renders location as "—" for seedling without a tray', () => {
    const garden = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    const cv = getAllCultivars()[0];
    garden.seedStarting.seedlings.push({
      id: 's1', cultivarId: cv.id, trayId: null,
      row: null, col: null, labelOverride: null,
    });
    const rows = buildPlantRows(garden, { actions: [] });
    expect(rows[0].location).toBe('—');
  });
});
