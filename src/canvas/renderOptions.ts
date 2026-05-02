import type { LabelMode } from '../store/uiStore';
import type { ViewTransform } from '@orochi235/weasel';
import type { PatternId } from './patterns';

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

export interface OverlayRenderOptions {
  view: ViewTransform;
  snapped: boolean;
}
