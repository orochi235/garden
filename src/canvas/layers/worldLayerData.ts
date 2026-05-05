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
}

export type GetUi = () => EricSceneUi;

/**
 * Static metadata for a single render layer. Each `*LayersWorld.ts` factory
 * exports a `*_LAYER_DESCRIPTORS` array as the single source of truth for
 * `id`/`label`/`alwaysOn`/`defaultVisible`. The factory reads its own labels
 * from the array (so they can't drift from what the sidebar panel shows), and
 * `RenderLayersPanel` imports the arrays directly for grouping.
 *
 * Anything dynamic (the `draw` closure, per-frame state) lives only on the
 * `RenderLayer` returned by the factory — not here.
 */
export interface LayerDescriptor {
  id: string;
  label: string;
  alwaysOn?: boolean;
  defaultVisible?: boolean;
}

/** Build a quick id→descriptor lookup so factories can pull metadata by id. */
export function descriptorById(
  descriptors: readonly LayerDescriptor[],
): Record<string, LayerDescriptor> {
  const out: Record<string, LayerDescriptor> = {};
  for (const d of descriptors) out[d.id] = d;
  return out;
}
