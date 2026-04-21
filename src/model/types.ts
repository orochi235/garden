import type { Arrangement } from './arrangement';
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
  snapToGrid: boolean;
  surface: boolean;
  container: boolean;
  fill: FillType | null;
  arrangement: Arrangement | null;
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
// TODO: containers should have some conception of their wall thickness/internal area for child shading purposes
const CONTAINER_TYPES = new Set(['raised-bed', 'pot', 'felt-planter']);

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
    snapToGrid: true,
    surface: SURFACE_TYPES.has(opts.type),
    container: CONTAINER_TYPES.has(opts.type),
    fill: CONTAINER_TYPES.has(opts.type) ? 'soil' : null,
    arrangement: DEFAULT_ARRANGEMENTS[opts.type]?.() ?? null,
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
