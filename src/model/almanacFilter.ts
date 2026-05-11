import type { AlmanacFilters } from '../store/uiStore';
import type { CellSize } from './nursery';
import type { Species } from './species';
import { resolveSeedStarting, type SeedStartingFields } from './floraSeedStarting';
import type { Cultivar } from './cultivars';

/**
 * Should this cultivar pass the active almanac filters?
 *
 * Each criterion uses a "missing data passes" rule: if the underlying species/cultivar
 * does not have data for that criterion, the filter does not exclude it. Only rows with
 * concrete data that fails the criterion are filtered out.
 */
export function passesAlmanacFilters(
  cultivar: Cultivar,
  species: Species | undefined,
  filters: AlmanacFilters,
): boolean {
  const seedStarting = resolveSeedStarting(species?.seedStarting, cultivar.seedStarting);

  if (filters.cellSizes.length > 0 && !filters.cellSizes.includes(seedStarting.cellSize)) {
    return false;
  }

  if (filters.seasons.length > 0) {
    const seasons = species?.seasons ?? null;
    if (seasons && !seasons.some((s) => filters.seasons.includes(s))) return false;
  }

  if (filters.usdaZone != null) {
    const zr = species?.usdaZones;
    if (zr && (filters.usdaZone < zr.min || filters.usdaZone > zr.max)) return false;
  }

  if (filters.lastFrostDate) {
    const w = seedStarting.weeksBeforeLastFrost;
    if (w) {
      const frost = parseISODate(filters.lastFrostDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weeksUntilFrost = (frost.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000);
      // w = [earliest, latest] weeks-before-frost; sow window is weeksUntilFrost in [w[1], w[0]].
      if (weeksUntilFrost > w[0] || weeksUntilFrost < w[1]) return false;
    }
  }

  return true;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function defaultCellSizes(): CellSize[] {
  return ['small', 'medium', 'large'];
}

export type { SeedStartingFields };
