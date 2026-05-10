import type { RenderLayer } from '@orochi235/weasel';
import type { DrawCommand } from '../util/weaselLocal';

/**
 * Wraps each layer's `draw` so it short-circuits when the user has hidden it
 * via `useUiStore.renderLayerVisibility`. `alwaysOn` layers ignore the flag.
 *
 * Why a wrapper rather than filtering the layer list: the Canvas needs a
 * stable layer-id set across renders for hit-test bookkeeping; only the paint
 * step is conditional.
 */
export function wrapLayersWithVisibility(
  layers: RenderLayer<unknown>[],
  getVisibility: () => Record<string, boolean | undefined>,
): RenderLayer<unknown>[] {
  return layers.map((layer) => {
    if (layer.alwaysOn) return layer;
    const defaultVis = layer.defaultVisible !== false;
    const innerDraw = layer.draw;
    return {
      ...layer,
      draw(data, view, dims): DrawCommand[] {
        const vis = getVisibility()[layer.id];
        const visible = vis ?? defaultVis;
        if (!visible) return [];
        return innerDraw(data, view, dims);
      },
    };
  });
}
