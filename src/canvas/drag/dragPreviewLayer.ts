import type { RenderLayer } from '@orochi235/weasel';
import { type DrawCommand, viewToMat3 } from '../util/weaselLocal';
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
    draw(_data, view, _dims): DrawCommand[] {
      const slot = useUiStore.getState().dragPreview;
      if (!slot) return [];
      const drag = registry[slot.kind];
      if (!drag) return [];
      const children = drag.renderPreview(slot.putative, view);
      return [{ kind: 'group', transform: viewToMat3(view), children }];
    },
  };
}
