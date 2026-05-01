import type { LabelMode } from '../store/uiStore';
import type { Planting, Structure, Zone } from '../model/types';
import type { ViewTransform } from '@orochi235/weasel';

/** Common base for structure, zone, and planting layer data. */
export interface EntityLayerData {
  view: ViewTransform;
  canvasWidth: number;
  canvasHeight: number;
  labelMode: LabelMode | 'none';
  labelFontSize: number;
  highlightOpacity: number;
}

export interface RenderedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StructureLayerData extends EntityLayerData {
  structures: Structure[];
  groups: Map<string, Structure[]>;
  ungrouped: Structure[];
  renderQueue: StructureRenderItem[];
  debugOverlappingLabels: boolean;
}

export type StructureRenderItem =
  | { type: 'single'; structure: Structure; order: number }
  | { type: 'group'; members: Structure[]; order: number };

export interface ZoneLayerData extends EntityLayerData {
  zones: Zone[];
}

export interface PlantingParent {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: string;
  arrangement: import('../model/arrangement').Arrangement | null;
  wallThicknessFt?: number;
}

export interface PlantingLayerData extends EntityLayerData {
  plantings: Planting[];
  plantingsByParent: Map<string, Planting[]>;
  parentMap: Map<string, PlantingParent>;
  childCount: Map<string, number>;
  structures: Structure[];
  zones: Zone[];
  selectedIds: string[];
  plantIconScale: number;
  showFootprintCircles: boolean;
  labelOccluders: RenderedRect[];
}

export interface SystemLayerData {
  selectedIds: string[];
  structures: Structure[];
  zones: Zone[];
  plantings: Planting[];
  view: ViewTransform;
  canvasWidth: number;
  canvasHeight: number;
}
