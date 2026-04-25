import type { CultivarCategory } from './cultivars';
import speciesData from '../data/species.json';

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
}

const species: Species[] = speciesData as Species[];
const speciesMap = new Map<string, Species>(species.map((s) => [s.id, s]));

export function getSpecies(id: string): Species | undefined {
  return speciesMap.get(id);
}

export function getAllSpecies(): Species[] {
  return species;
}
