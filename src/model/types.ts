export type DisplayUnit = 'ft' | 'in' | 'm' | 'cm';

export type LayerId = 'ground' | 'blueprint' | 'structures' | 'zones' | 'plantings';

export interface Blueprint {
  imageData: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface Structure {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  label: string;
  zIndex: number;
  parentId: string | null;
  snapToGrid: boolean;
}

export interface Zone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label: string;
  zIndex: number;
  parentId: string | null;
  soilType: string | null;
  sunExposure: string | null;
}

export interface Planting {
  id: string;
  zoneId: string;
  x: number;
  y: number;
  name: string;
  color: string;
  icon: string | null;
  variety: string | null;
  spacingFt: number | null;
}

export interface Garden {
  id: string;
  version: number;
  name: string;
  widthFt: number;
  heightFt: number;
  gridCellSizeFt: number;
  displayUnit: DisplayUnit;
  groundColor: string;
  blueprint: Blueprint | null;
  structures: Structure[];
  zones: Zone[];
  plantings: Planting[];
}

let _idCounter = 0;
export function generateId(): string {
  return crypto.randomUUID?.() ?? `id-${++_idCounter}-${Date.now()}`;
}

export function createGarden(opts: { name: string; widthFt: number; heightFt: number }): Garden {
  return {
    id: generateId(),
    version: 1,
    name: opts.name,
    widthFt: opts.widthFt,
    heightFt: opts.heightFt,
    gridCellSizeFt: 1,
    displayUnit: 'ft',
    groundColor: '#E8E0D0',
    blueprint: null,
    structures: [],
    zones: [],
    plantings: [],
  };
}

const DEFAULT_STRUCTURE_COLORS: Record<string, string> = {
  'raised-bed': '#8B6914',
  'pot': '#C75B39',
  'fence': '#5C4033',
  'path': '#D4C4A8',
  'patio': '#A0926B',
};

export function createStructure(opts: {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): Structure {
  return {
    id: generateId(),
    type: opts.type,
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    rotation: 0,
    color: DEFAULT_STRUCTURE_COLORS[opts.type] ?? '#8B6914',
    label: '',
    zIndex: 0,
    parentId: null,
    snapToGrid: true,
  };
}

export function createZone(opts: { x: number; y: number; width: number; height: number }): Zone {
  return {
    id: generateId(),
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    color: '#7FB06944',
    label: '',
    zIndex: 0,
    parentId: null,
    soilType: null,
    sunExposure: null,
  };
}

export function createPlanting(opts: {
  zoneId: string;
  x: number;
  y: number;
  name: string;
}): Planting {
  return {
    id: generateId(),
    zoneId: opts.zoneId,
    x: opts.x,
    y: opts.y,
    name: opts.name,
    color: '#4A7C59',
    icon: null,
    variety: null,
    spacingFt: null,
  };
}
