import { type RenderLayer, PathBuilder } from '@orochi235/weasel';
import type { DrawCommand } from '../util/weaselLocal';
import type { LayerDescriptor } from './worldLayerData';
import { descriptorById } from './worldLayerData';

/**
 * Single source of truth for system-layer metadata. Order here = canonical
 * draw order. The factory below pulls `label`/`alwaysOn`/`defaultVisible` from
 * these entries by id, and `RenderLayersPanel` imports the array to build its
 * "System" group.
 *
 * The system layer is a small, mode-agnostic chrome overlay: today it's just
 * an origin crosshair at world (0,0). Coordinate axes and a grid-debug overlay
 * used to belong here too, but they're gated by the `?debug=` flag and now
 * live in `debugLayers.ts` (`debug-axes`, `debug-grid`).
 */
export const SYSTEM_LAYER_DESCRIPTORS: readonly LayerDescriptor[] = [
  { id: 'system-origin', label: 'System (origin)', alwaysOn: true },
];

/** Origin marker at world (0,0). One screen pixel per world unit becomes
 *  imperceptible at high zoom-out, so we draw in screen px via the view. */
function createOriginLayer(meta: LayerDescriptor): RenderLayer<unknown> {
  return {
    ...meta,
    space: 'screen',
    draw(_data, view, _dims): DrawCommand[] {
      const ox = (0 - view.x) * view.scale;
      const oy = (0 - view.y) * view.scale;
      const r = 4;
      const stroke = { paint: { fill: 'solid' as const, color: 'rgba(0,0,0,0.3)' }, width: 1 };
      const horiz = new PathBuilder().moveTo(ox - r, oy).lineTo(ox + r, oy).build();
      const vert = new PathBuilder().moveTo(ox, oy - r).lineTo(ox, oy + r).build();
      return [
        { kind: 'path', path: horiz, stroke },
        { kind: 'path', path: vert, stroke },
      ];
    },
  };
}

/**
 * Build the system layers (origin marker today; future: chrome overlays that
 * are mode-agnostic and not gated by debug tokens). Mirrors the shape of the
 * other `*LayersWorld.ts` factories so the descriptor / panel / registry
 * pattern stays uniform.
 */
export function createSystemLayers(): RenderLayer<unknown>[] {
  const meta = descriptorById(SYSTEM_LAYER_DESCRIPTORS);
  return [createOriginLayer(meta['system-origin'])];
}
