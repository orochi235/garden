import type { CultivarCategory } from './cultivars';
import type { SeedStartingFields } from './floraSeedStarting';
import speciesData from '../data/species.json';

export type Season = 'cool' | 'warm';

export interface UsdaZoneRange {
  /** Min hardiness zone (e.g., 3 for very cold). */
  min: number;
  /** Max hardiness zone (e.g., 10 for very warm). */
  max: number;
}

export interface Species {
  id: string;
  name: string;
  taxonomicName: string;
  category: CultivarCategory;
  color: string;
  footprintFt: number;
  spacingFt: number;
  iconImage: string | null;
  iconBgColor: string | null;
  seedStarting?: Partial<SeedStartingFields>;
  /** Cool / warm season classification. */
  seasons?: Season[];
  /** USDA hardiness zone range where this species can be grown. */
  usdaZones?: UsdaZoneRange;
  /** Mature plant height in feet. Optional — used by sun-shading objective. */
  heightFt?: number;
  /** True for vining/climbing cultivars that prefer a trellis edge. */
  climber?: boolean;
}

const species: Species[] = speciesData as Species[];
const speciesMap = new Map<string, Species>(species.map((s) => [s.id, s]));

export function getSpecies(id: string): Species | undefined {
  return speciesMap.get(id);
}

export function getAllSpecies(): Species[] {
  return species;
}
