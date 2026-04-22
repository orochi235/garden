import type { CultivarCategory } from './cultivars';
import speciesData from '../data/species.json';

export type IconType =
  | 'round-fruit' | 'pepper' | 'bell-pepper' | 'eggplant' | 'cucumber' | 'melon'
  | 'squash' | 'leaf-rosette' | 'carrot' | 'radish' | 'potato'
  | 'herb-sprig' | 'strawberry' | 'pea-pod' | 'bean';

export interface Species {
  id: string;
  name: string;
  taxonomicName: string;
  category: CultivarCategory;
  icon: IconType;
  color: string;
  footprintFt: number;
  spacingFt: number;
}

const species: Species[] = speciesData as Species[];
const speciesMap = new Map<string, Species>(species.map((s) => [s.id, s]));

export function getSpecies(id: string): Species | undefined {
  return speciesMap.get(id);
}

export function getAllSpecies(): Species[] {
  return species;
}
