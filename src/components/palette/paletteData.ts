export interface PaletteEntry {
  id: string;
  name: string;
  category: 'structures' | 'zones' | 'plantings';
  type: string;
  defaultWidth: number;
  defaultHeight: number;
  color: string;
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
    id: 'fence',
    name: 'Fence',
    category: 'structures',
    type: 'fence',
    defaultWidth: 8,
    defaultHeight: 0.5,
    color: '#5C4033',
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
    name: 'Planting Zone',
    category: 'zones',
    type: 'zone',
    defaultWidth: 4,
    defaultHeight: 4,
    color: '#7FB06944',
  },
  {
    id: 'herb-zone',
    name: 'Herb Zone',
    category: 'zones',
    type: 'zone',
    defaultWidth: 3,
    defaultHeight: 3,
    color: '#4A7C5944',
  },
  // Plantings
  {
    id: 'tomato',
    name: 'Tomato',
    category: 'plantings',
    type: 'planting',
    defaultWidth: 0,
    defaultHeight: 0,
    color: '#E05555',
  },
  {
    id: 'basil',
    name: 'Basil',
    category: 'plantings',
    type: 'planting',
    defaultWidth: 0,
    defaultHeight: 0,
    color: '#4A7C59',
  },
  {
    id: 'pepper',
    name: 'Pepper',
    category: 'plantings',
    type: 'planting',
    defaultWidth: 0,
    defaultHeight: 0,
    color: '#E07B3C',
  },
  {
    id: 'lettuce',
    name: 'Lettuce',
    category: 'plantings',
    type: 'planting',
    defaultWidth: 0,
    defaultHeight: 0,
    color: '#7FB069',
  },
  {
    id: 'carrot',
    name: 'Carrot',
    category: 'plantings',
    type: 'planting',
    defaultWidth: 0,
    defaultHeight: 0,
    color: '#E0943C',
  },
  {
    id: 'cucumber',
    name: 'Cucumber',
    category: 'plantings',
    type: 'planting',
    defaultWidth: 0,
    defaultHeight: 0,
    color: '#2D7A27',
  },
];

export const categories = [
  { id: 'structures', label: 'Structures' },
  { id: 'zones', label: 'Zones' },
  { id: 'plantings', label: 'Plantings' },
] as const;
