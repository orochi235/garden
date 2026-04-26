import type { Arrangement, ParentBounds } from './arrangement';
import { defaultArrangement } from './arrangement';
import { getCultivar } from './cultivars';

export type DisplayUnit = 'ft' | 'in' | 'm' | 'cm';

export type LayerId = 'ground' | 'blueprint' | 'structures' | 'zones' | 'plantings';

export interface Blueprint {
  imageData: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export type StructureShape = 'rectangle' | 'circle';

export interface Structure {
  id: string;
  type: string;
  shape: StructureShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  label: string;
  zIndex: number;
  parentId: string | null;
  groupId: string | null;
  snapToGrid: boolean;
  surface: boolean;
  container: boolean;
  fill: FillType | null;
  arrangement: Arrangement | null;
  wallThicknessFt: number;
}

export type FillType = 'soil' | 'sand' | 'rocks' | 'peat' | 'potting-mix';

export const FILL_COLORS: Record<FillType, string> = {
  soil: '#5C4033',
  sand: '#D2B48C',
  rocks: '#8A8A8A',
  peat: '#6B5745',
  'potting-mix': '#1E1510',
};

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
  arrangement: Arrangement | null;
  pattern: string | null;
}

export interface Planting {
  id: string;
  parentId: string;
  cultivarId: string;
  x: number;
  y: number;
  label: string;
  icon: string | null;
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
    groundColor: '#4A7C59',
    blueprint: null,
    structures: [],
    zones: [],
    plantings: [],
  };
}

const DEFAULT_STRUCTURE_COLORS: Record<string, string> = {
  'raised-bed': '#8B6914',
  pot: '#C75B39',
  'felt-planter': '#3A3A3A',
  fence: '#5C4033',
  trellis: '#8B7355',
  path: '#D4C4A8',
  patio: '#A0926B',
};

const DEFAULT_STRUCTURE_SHAPES: Record<string, StructureShape> = {
  pot: 'circle',
  'felt-planter': 'circle',
};

const SURFACE_TYPES = new Set(['patio', 'path']);
const CONTAINER_TYPES = new Set(['raised-bed', 'pot', 'felt-planter']);

export const DEFAULT_WALL_THICKNESS_FT: Record<string, number> = {
  'raised-bed': 1 / 12,
  pot: 0.06,
  'felt-planter': 0.04,
};

const DEFAULT_ARRANGEMENTS: Record<string, () => Arrangement> = {
  'raised-bed': () => defaultArrangement('rows'),
  pot: () => defaultArrangement('single'),
  'felt-planter': () => defaultArrangement('single'),
};

export function createStructure(opts: {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: StructureShape;
  groupId?: string;
}): Structure {
  return {
    id: generateId(),
    type: opts.type,
    shape: opts.shape ?? DEFAULT_STRUCTURE_SHAPES[opts.type] ?? 'rectangle',
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    rotation: 0,
    color: DEFAULT_STRUCTURE_COLORS[opts.type] ?? '#8B6914',
    label: opts.type,
    zIndex: 0,
    parentId: null,
    groupId: opts.groupId ?? null,
    snapToGrid: true,
    surface: SURFACE_TYPES.has(opts.type),
    container: CONTAINER_TYPES.has(opts.type),
    fill: CONTAINER_TYPES.has(opts.type) ? 'soil' : null,
    arrangement: DEFAULT_ARRANGEMENTS[opts.type]?.() ?? null,
    wallThicknessFt: DEFAULT_WALL_THICKNESS_FT[opts.type] ?? 0,
  };
}

export function createZone(opts: { x: number; y: number; width: number; height: number; color?: string; pattern?: string | null }): Zone {
  return {
    id: generateId(),
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    color: opts.color ?? '#7FB06944',
    label: 'zone',
    zIndex: 0,
    parentId: null,
    soilType: null,
    sunExposure: null,
    arrangement: defaultArrangement('grid'),
    pattern: opts.pattern ?? null,
  };
}

export function createPlanting(opts: {
  parentId: string;
  x: number;
  y: number;
  cultivarId: string;
}): Planting {
  const cultivar = getCultivar(opts.cultivarId);
  return {
    id: generateId(),
    parentId: opts.parentId,
    cultivarId: opts.cultivarId,
    x: opts.x,
    y: opts.y,
    label: cultivar?.name ?? opts.cultivarId,
    icon: null,
  };
}

/** Return the inner plantable bounds of a structure, inset by wall thickness. */
export function getPlantableBounds(s: { x: number; y: number; width: number; height: number; shape?: string; wallThicknessFt?: number }): ParentBounds {
  const wall = s.wallThicknessFt ?? 0;
  const inset = wall * 2;
  return {
    x: s.x + wall,
    y: s.y + wall,
    width: Math.max(0, s.width - inset),
    height: Math.max(0, s.height - inset),
    shape: (s.shape === 'circle' ? 'circle' : 'rectangle') as 'rectangle' | 'circle',
  };
}
