import { getAllCultivars } from '../../model/cultivars';
import { getSpecies } from '../../model/species';

export interface PaletteEntry {
  id: string;
  name: string;
  category: 'structures' | 'zones' | 'plantings';
  /** Species ID for grouping plantings */
  speciesId?: string;
  /** Species display name for section headers */
  speciesName?: string;
  /** Display name within the species group (variety name, or full name if no variety) */
  varietyLabel?: string;
  type: string;
  defaultWidth: number;
  defaultHeight: number;
  color: string;
  pattern?: string | null;
}

export const paletteItems: PaletteEntry[] = [
  // Structures
  {
    id: 'raised-bed',
    name: 'Raised Bed',
    category: 'structures',
    type: 'raised-bed',
    defaultWidth: 4,
    defaultHeight: 8,
    color: '#8B6914',
  },
  {
    id: 'pot-small',
    name: 'Small Pot',
    category: 'structures',
    type: 'pot',
    defaultWidth: 1,
    defaultHeight: 1,
    color: '#C75B39',
  },
  {
    id: 'pot-large',
    name: 'Large Pot',
    category: 'structures',
    type: 'pot',
    defaultWidth: 2,
    defaultHeight: 2,
    color: '#C75B39',
  },
  {
    id: 'felt-planter',
    name: 'Felt Planter',
    category: 'structures',
    type: 'felt-planter',
    defaultWidth: 1.5,
    defaultHeight: 1.5,
    color: '#3A3A3A',
  },
  {
    id: 'fence',
    name: 'Fence',
    category: 'structures',
    type: 'fence',
    defaultWidth: 8,
    defaultHeight: 0.5,
    color: '#5C4033',
  },
  {
    id: 'trellis',
    name: 'Trellis',
    category: 'structures',
    type: 'trellis',
    defaultWidth: 4,
    defaultHeight: 0.5,
    color: '#8B7355',
  },
  {
    id: 'path',
    name: 'Path',
    category: 'structures',
    type: 'path',
    defaultWidth: 2,
    defaultHeight: 6,
    color: '#D4C4A8',
  },
  {
    id: 'patio',
    name: 'Patio',
    category: 'structures',
    type: 'patio',
    defaultWidth: 8,
    defaultHeight: 8,
    color: '#A0926B',
  },
  // Zones
  {
    id: 'planting-zone',
    name: 'Allow',
    category: 'zones',
    type: 'zone',
    defaultWidth: 4,
    defaultHeight: 4,
    color: '#7FB06944',
  },
  {
    id: 'exclusion-zone',
    name: 'Exclude',
    category: 'zones',
    type: 'zone',
    defaultWidth: 3,
    defaultHeight: 3,
    color: 'transparent',
    pattern: 'crosshatch',
  },
  // Plantings — grouped by species, sorted by variety within each
  ...getAllCultivars().map((c) => {
    const species = getSpecies(c.speciesId);
    return {
      id: c.id,
      name: c.name,
      category: 'plantings' as const,
      speciesId: c.speciesId,
      speciesName: species?.name ?? c.speciesId,
      varietyLabel: c.variety ?? c.name,
      type: 'planting',
      defaultWidth: 0,
      defaultHeight: 0,
      color: c.color,
    };
  }),
];

export const categories = [
  { id: 'structures', label: 'Structures' },
  { id: 'zones', label: 'Zones' },
  { id: 'plantings', label: 'Plantings' },
] as const;

