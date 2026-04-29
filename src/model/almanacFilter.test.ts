import { describe, expect, it } from 'vitest';
import { defaultCellSizes, passesAlmanacFilters } from './almanacFilter';
import { DEFAULT_SEED_STARTING_FIELDS } from './floraSeedStarting';
import type { Cultivar } from './cultivars';
import type { Species } from './species';
import type { AlmanacFilters } from '../store/uiStore';

const emptyFilters: AlmanacFilters = {
  cellSizes: [],
  seasons: [],
  usdaZone: null,
  lastFrostDate: null,
};

function makeCultivar(over: Partial<Cultivar> = {}): Cultivar {
  return {
    id: 'c',
    speciesId: 's',
    name: 'C',
    category: 'vegetables',
    taxonomicName: '',
    variety: null,
    color: '#fff',
    footprintFt: 1,
    spacingFt: 1,
    iconImage: null,
    iconBgColor: null,
    seedStarting: { ...DEFAULT_SEED_STARTING_FIELDS },
    ...over,
  };
}

function makeSpecies(over: Partial<Species> = {}): Species {
  return {
    id: 's',
    name: 'S',
    taxonomicName: '',
    category: 'vegetables',
    color: '#fff',
    footprintFt: 1,
    spacingFt: 1,
    iconImage: null,
    iconBgColor: null,
    ...over,
  };
}

describe('passesAlmanacFilters', () => {
  it('passes when all filters empty', () => {
    expect(passesAlmanacFilters(makeCultivar(), makeSpecies(), emptyFilters)).toBe(true);
  });

  describe('cellSizes', () => {
    it('passes when cell size is in filter', () => {
      const c = makeCultivar({ seedStarting: { ...DEFAULT_SEED_STARTING_FIELDS, cellSize: 'small' } });
      expect(passesAlmanacFilters(c, makeSpecies(), { ...emptyFilters, cellSizes: ['small', 'medium'] })).toBe(true);
    });

    it('fails when cell size not in filter', () => {
      const c = makeCultivar({ seedStarting: { ...DEFAULT_SEED_STARTING_FIELDS, cellSize: 'large' } });
      expect(passesAlmanacFilters(c, makeSpecies(), { ...emptyFilters, cellSizes: ['small'] })).toBe(false);
    });

    it('cultivar override wins over species default', () => {
      const species = makeSpecies({ seedStarting: { cellSize: 'large' } });
      const c = makeCultivar({ seedStarting: { ...DEFAULT_SEED_STARTING_FIELDS, cellSize: 'small' } });
      expect(passesAlmanacFilters(c, species, { ...emptyFilters, cellSizes: ['small'] })).toBe(true);
    });
  });

  describe('seasons', () => {
    it('passes when species season matches', () => {
      const s = makeSpecies({ seasons: ['cool'] });
      expect(passesAlmanacFilters(makeCultivar(), s, { ...emptyFilters, seasons: ['cool'] })).toBe(true);
    });

    it('fails when species season set but does not match', () => {
      const s = makeSpecies({ seasons: ['warm'] });
      expect(passesAlmanacFilters(makeCultivar(), s, { ...emptyFilters, seasons: ['cool'] })).toBe(false);
    });

    it('passes when species has no seasons declared (missing data passes)', () => {
      expect(passesAlmanacFilters(makeCultivar(), makeSpecies(), { ...emptyFilters, seasons: ['cool'] })).toBe(true);
    });
  });

  describe('usdaZone', () => {
    it('passes when zone is in range', () => {
      const s = makeSpecies({ usdaZones: { min: 4, max: 8 } });
      expect(passesAlmanacFilters(makeCultivar(), s, { ...emptyFilters, usdaZone: 6 })).toBe(true);
    });

    it('fails when below range', () => {
      const s = makeSpecies({ usdaZones: { min: 4, max: 8 } });
      expect(passesAlmanacFilters(makeCultivar(), s, { ...emptyFilters, usdaZone: 3 })).toBe(false);
    });

    it('fails when above range', () => {
      const s = makeSpecies({ usdaZones: { min: 4, max: 8 } });
      expect(passesAlmanacFilters(makeCultivar(), s, { ...emptyFilters, usdaZone: 9 })).toBe(false);
    });

    it('passes at boundaries', () => {
      const s = makeSpecies({ usdaZones: { min: 4, max: 8 } });
      expect(passesAlmanacFilters(makeCultivar(), s, { ...emptyFilters, usdaZone: 4 })).toBe(true);
      expect(passesAlmanacFilters(makeCultivar(), s, { ...emptyFilters, usdaZone: 8 })).toBe(true);
    });

    it('passes when species has no usdaZones (missing data passes)', () => {
      expect(passesAlmanacFilters(makeCultivar(), makeSpecies(), { ...emptyFilters, usdaZone: 6 })).toBe(true);
    });
  });

  describe('lastFrostDate', () => {
    it('passes when today falls within sow window', () => {
      // weeksBeforeLastFrost: [8, 4] means start 8w before frost, latest 4w before frost.
      // Set frost 6 weeks out — within [4, 8].
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const frost = new Date(today.getTime() + 6 * 7 * 24 * 60 * 60 * 1000);
      const iso = `${frost.getFullYear()}-${String(frost.getMonth() + 1).padStart(2, '0')}-${String(frost.getDate()).padStart(2, '0')}`;
      const c = makeCultivar({
        seedStarting: { ...DEFAULT_SEED_STARTING_FIELDS, weeksBeforeLastFrost: [8, 4] },
      });
      expect(passesAlmanacFilters(c, makeSpecies(), { ...emptyFilters, lastFrostDate: iso })).toBe(true);
    });

    it('fails when today is too early (before window opens)', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const frost = new Date(today.getTime() + 12 * 7 * 24 * 60 * 60 * 1000);
      const iso = `${frost.getFullYear()}-${String(frost.getMonth() + 1).padStart(2, '0')}-${String(frost.getDate()).padStart(2, '0')}`;
      const c = makeCultivar({
        seedStarting: { ...DEFAULT_SEED_STARTING_FIELDS, weeksBeforeLastFrost: [8, 4] },
      });
      expect(passesAlmanacFilters(c, makeSpecies(), { ...emptyFilters, lastFrostDate: iso })).toBe(false);
    });

    it('fails when today is past the late end', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const frost = new Date(today.getTime() + 2 * 7 * 24 * 60 * 60 * 1000);
      const iso = `${frost.getFullYear()}-${String(frost.getMonth() + 1).padStart(2, '0')}-${String(frost.getDate()).padStart(2, '0')}`;
      const c = makeCultivar({
        seedStarting: { ...DEFAULT_SEED_STARTING_FIELDS, weeksBeforeLastFrost: [8, 4] },
      });
      expect(passesAlmanacFilters(c, makeSpecies(), { ...emptyFilters, lastFrostDate: iso })).toBe(false);
    });

    it('passes when cultivar has no weeksBeforeLastFrost (missing data passes)', () => {
      const c = makeCultivar();
      expect(passesAlmanacFilters(c, makeSpecies(), { ...emptyFilters, lastFrostDate: '2026-05-01' })).toBe(true);
    });
  });

  it('combines criteria with AND', () => {
    const s = makeSpecies({ seasons: ['cool'], usdaZones: { min: 4, max: 8 } });
    const c = makeCultivar({ seedStarting: { ...DEFAULT_SEED_STARTING_FIELDS, cellSize: 'small' } });
    expect(passesAlmanacFilters(c, s, {
      cellSizes: ['small'],
      seasons: ['cool'],
      usdaZone: 6,
      lastFrostDate: null,
    })).toBe(true);
    expect(passesAlmanacFilters(c, s, {
      cellSizes: ['small'],
      seasons: ['warm'],
      usdaZone: 6,
      lastFrostDate: null,
    })).toBe(false);
  });
});

describe('defaultCellSizes', () => {
  it('returns all three sizes', () => {
    expect(defaultCellSizes()).toEqual(['small', 'medium', 'large']);
  });
});
