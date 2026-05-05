import type { RenderLayer } from '@orochi235/weasel';
import { useUiStore } from '../../store/uiStore';
import type { Drag } from './putativeDrag';

/**
 * Generic render layer for the putative-drag framework. Reads the active
 * `dragPreview` from `uiStore` and dispatches to the matching drag's
 * `renderPreview`.
 *
 * In Phase 1 only the seed-fill-tray drag is migrated, and its `renderPreview`
 * is a no-op (the legacy `seedling-fill-preview` layer keeps rendering via
 * the mirrored `seedFillPreview` slot). This layer is wired in regardless so
 * Phase 2+ migrations can plug in by simply registering their `Drag` in the
 * registry — no canvas wiring changes needed.
 */
export function createDragPreviewLayer(
  registry: Record<string, Drag<unknown, unknown>>,
): RenderLayer<unknown> {
  return {
    id: 'drag-preview',
    label: 'Drag Preview',
    alwaysOn: true,
    draw(ctx, _data, view) {
      const slot = useUiStore.getState().dragPreview;
      if (!slot) return;
      const drag = registry[slot.kind];
      if (!drag) return;
      drag.renderPreview(ctx, slot.putative, view);
    },
  };
}
