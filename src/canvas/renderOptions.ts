import type { LabelMode } from '../store/uiStore';
import type { ViewTransform } from '../utils/grid';
import type { PatternId } from './patterns';

export interface PlantOverlay {
  footprintFill?: string;
  footprintOpacity?: number;
  spacingStroke?: string;
  spacingOpacity?: number;
  highlightRing?: {
    color: string;
    radiusFt: number;
    dashPattern?: number[];
  };
}

/** Common rendering options shared across all layer render functions. */
export interface RenderOptions {
  view: ViewTransform;
  canvasWidth: number;
  canvasHeight: number;
  highlightOpacity?: number;
  skipClear?: boolean;
  labelMode?: LabelMode | 'none';
  labelFontSize?: number;
}

export interface StructureRenderOptions extends RenderOptions {
  showSurfaces?: boolean;
  showPlantableArea?: boolean;
  debugOverlappingLabels?: boolean;
}

export interface ZoneRenderOptions extends RenderOptions {
  patternOverride?: PatternId | null;
}

export interface PlantingRenderOptions extends RenderOptions {
  selectedIds?: string[];
  showSpacingBorders?: boolean;
  showFootprintCircles?: boolean;
  showMeasurements?: boolean;
  plantIconScale?: number;
  overlays?: Map<string, PlantOverlay>;
}

export interface OverlayRenderOptions {
  view: ViewTransform;
  snapped: boolean;
}
