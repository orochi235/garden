/**
 * A single named render sub-layer within a canvas renderer.
 *
 * @template TData - The data object passed to each draw call.
 */
export interface RenderLayer<TData> {
  /** Unique identifier used in visibility maps and ordering arrays. */
  id: string;
  /** Human-readable name for UI toggles. */
  label: string;
  /** Draw this layer's content onto the canvas. */
  draw: (ctx: CanvasRenderingContext2D, data: TData) => void;
  /**
   * Whether the layer is shown when no explicit visibility entry exists.
   * Defaults to `true` when absent.
   */
  defaultVisible?: boolean;
  /**
   * When true, the layer is always drawn regardless of the visibility map.
   * Useful for layers that must never be hidden (e.g. base grid).
   */
  alwaysOn?: boolean;
}

/**
 * Iterate layers and call `draw` for each visible one.
 *
 * Visibility resolution order:
 *   1. `alwaysOn` — always drawn, ignores visibility map.
 *   2. Explicit entry in `visibility` map — overrides default.
 *   3. `layer.defaultVisible` — falls back to `true` when absent.
 *
 * @param ctx        Canvas 2D context passed through to each draw call.
 * @param layers     All registered layers (used both as the source of draw
 *                   functions and as the default iteration order).
 * @param data       Render data passed through to each draw call.
 * @param visibility Map from layer id → explicit boolean override.
 * @param order      Optional array of layer ids specifying draw order.
 *                   Layers absent from `order` are not drawn.
 */
export function runLayers<TData>(
  ctx: CanvasRenderingContext2D,
  layers: RenderLayer<TData>[],
  data: TData,
  visibility: Record<string, boolean>,
  order?: string[],
): void {
  const layerById = new Map(layers.map((l) => [l.id, l]));

  const sequence = order
    ? order.map((id) => layerById.get(id)).filter((l): l is RenderLayer<TData> => l !== undefined)
    : layers;

  for (const layer of sequence) {
    const visible =
      layer.alwaysOn ||
      (layer.id in visibility ? visibility[layer.id] : (layer.defaultVisible ?? true));

    if (visible) {
      layer.draw(ctx, data);
    }
  }
}
