import type { View as KitView } from '@orochi235/weasel';
import type { LabelMode } from '../../store/uiStore';

/** Camera-coords viewport. eric uses **uniform** zoom, so its viewport state
 *  keeps a scalar `scale` (mirrored to `uiStore`, consumed across the drag/
 *  nursery/palette paths). weasel HEAD's `View` instead carries a per-axis
 *  `scale: { x, y }` vector; convert at the kit boundary with
 *  {@link toKitView} / {@link fromKitView} rather than threading the 2-vector
 *  through eric's uniform-zoom code. */
export interface View {
  x: number;
  y: number;
  scale: number;
}

/** eric scalar `View` → weasel HEAD `View` (uniform zoom → equal x/y axes). */
export function toKitView(v: View): KitView {
  return { x: v.x, y: v.y, scale: { x: v.scale, y: v.scale } };
}

/** weasel HEAD `View` → eric scalar `View` (collapse the per-axis zoom; eric is
 *  always uniform so `scale.x === scale.y`). */
export function fromKitView(v: KitView): View {
  return { x: v.x, y: v.y, scale: v.scale.x };
}

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
  /** Per-id selection-flash highlight opacity in `[0, 1]`. Returns `0` when
   *  the id is not currently flashing/hovered. Layers iterate their entities
   *  and call this for each id rather than reading a single aggregated number.
   *  Mirrors the nursery layers' `getHighlight` callback shape. */
  getHighlight: (id: string) => number;
  debugOverlappingLabels: boolean;
  /**
   * Ids of non-dragging structures whose AABB intersects the dragging set.
   * Populated only while a structure drag is in flight; empty otherwise.
   * Rendered as a red-tinted clash highlight by `structure-highlights`.
   */
  dragClashIds: string[];
  /**
   * In-flight palette-drop drag putative, when the user is dragging a new
   * planting from the palette over a container. Lets the conflict overlay
   * include the ghost in occupancy compute so red/yellow shading appears
   * before the user releases.
   */
  dragPlantingGhost?: { parentId: string; cultivarId: string; x: number; y: number } | null;
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
