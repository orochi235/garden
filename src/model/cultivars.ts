import cultivarData from '../data/cultivars.json';

export type CultivarCategory = 'herbs' | 'vegetables' | 'fruits' | 'flowers' | 'root-vegetables' | 'legumes';

export interface Cultivar {
  id: string;
  name: string;
  category: CultivarCategory;
  taxonomicName: string;
  variety: string | null;
  color: string;
  footprintFt: number;
  spacingFt: number;
}

const cultivars: Cultivar[] = cultivarData as Cultivar[];

const cultivarMap = new Map<string, Cultivar>(cultivars.map((c) => [c.id, c]));

export function getCultivar(id: string): Cultivar | undefined {
  return cultivarMap.get(id);
}

export function getAllCultivars(): Cultivar[] {
  return cultivars;
}
