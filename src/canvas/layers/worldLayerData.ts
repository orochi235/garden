import type { LabelMode } from '../../store/uiStore';

/** Camera-coords viewport. Mirrors `@orochi235/weasel`'s internal `View` (not
 *  exported from the package index). */
export interface View { x: number; y: number; scale: number }

/**
 * Per-frame UI knobs that vary across renders. Read via a closure-supplied
 * getter rather than passed through the kit's `data` arg, since `<Canvas>`
 * passes its own `CanvasHelpers` as `data`.
 */
export interface EricSceneUi {
  selectedIds: string[];
  labelMode: LabelMode | 'none';
  labelFontSize: number;
  plantIconScale: number;
  showFootprintCircles: boolean;
  highlightOpacity: number;
  debugOverlappingLabels: boolean;
  /**
   * Ids of non-dragging structures whose AABB intersects the dragging set.
   * Populated only while a structure drag is in flight; empty otherwise.
   * Rendered as a red-tinted clash highlight by `structure-highlights`.
   */
  dragClashIds: string[];
}

export type GetUi = () => EricSceneUi;
