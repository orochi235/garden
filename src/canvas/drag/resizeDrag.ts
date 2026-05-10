import type { Drag, DragPointerSample, DragViewport } from './putativeDrag';
import { type DrawCommand } from '../util/weaselLocal';
import { PathBuilder, rectPath } from '@orochi235/weasel';
import { useGardenStore } from '../../store/gardenStore';

function circlePath(cx: number, cy: number, rx: number, ry: number): ReturnType<PathBuilder['build']> {
  const k = 0.5522847498;
  return new PathBuilder()
    .moveTo(cx, cy - ry)
    .curveTo(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy)
    .curveTo(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry)
    .curveTo(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy)
    .curveTo(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry)
    .close()
    .build();
}

/**
 * Phase-2-migrated drag: structure / zone resize.
 *
 * **Approach: Option A — façade over weasel's `useResize`.** Same pattern as
 * `moveDrag`: the actual gesture engine is `useResize` inside
 * `useEricSelectTool`, and that tool mirrors the live `structureResize.overlay`
 * / `zoneResize.overlay` into `uiStore.dragPreview` on each frame. This
 * `Drag.renderPreview` becomes the canonical drawer; the framework's
 * `dragPreviewLayer` dispatches to it.
 *
 * `compute` is purely informational (the framework controller never invokes
 * it for this drag — the Tool publishes putatives to the slot directly). It's
 * exported as an identity transform so the `Drag<T,U>` shape is honored and
 * tests can exercise the rendering path with a hand-rolled putative.
 *
 * `commit` is a no-op: weasel's `useResize.end` calls `applyBatch` on the
 * resize adapter, which already snapshots `gardenStore.checkpoint()` exactly
 * once per gesture. One undo step is preserved.
 */

/** Layer the resize is operating on, for rendering chrome. */
export type ResizeLayer = 'structures' | 'zones';

export interface ResizeInput {
  targetId: string;
  layer: ResizeLayer;
  /** Projected new bounds at this pointer sample. */
  pose: { x: number; y: number; width: number; length: number };
}

/** What `useEricSelectTool` writes into `uiStore.dragPreview` on every move. */
export interface ResizePutative {
  targetId: string;
  layer: ResizeLayer;
  /** Projected new bounds (post-snap, post-clamp). */
  pose: { x: number; y: number; width: number; length: number };
}

export const RESIZE_DRAG_KIND = 'eric-resize';

export function createResizeDrag(): Drag<ResizeInput, ResizePutative> {
  return {
    kind: RESIZE_DRAG_KIND,

    read(_sample: DragPointerSample, _viewport: DragViewport): ResizeInput {
      // Framework controller doesn't drive this drag; satisfy the contract.
      return {
        targetId: '',
        layer: 'structures',
        pose: { x: 0, y: 0, width: 0, length: 0 },
      };
    },

    compute(input: ResizeInput): ResizePutative | null {
      if (!input.targetId) return null;
      return { targetId: input.targetId, layer: input.layer, pose: input.pose };
    },

    /**
     * Draws the projected resized ghost at the new bounds: translucent body
     * fill + outline. Visual conventions match `moveDrag`:
     *  - structures get a translucent body fill (#cfe2ec) with a #5BA4CF outline
     *  - zones get a translucent tint of their own color with a #5BA4CF outline
     *
     * Runs in WORLD space (the framework's `dragPreviewLayer` registers without
     * `space: 'screen'`). Stroke width is scaled inversely by view to read as
     * a constant ~1.5px outline at typical zooms.
     */
    renderPreview(putative, view): DrawCommand[] {
      const garden = useGardenStore.getState().garden;
      const { pose, layer, targetId } = putative;
      const strokeWidth = 1.5 / Math.max(0.0001, view.scale);

      if (layer === 'structures') {
        const structure = garden.structures.find((s) => s.id === targetId);
        if (!structure) return [];
        const path = (structure as { shape?: string }).shape === 'circle'
          ? circlePath(pose.x + pose.width / 2, pose.y + pose.length / 2, pose.width / 2, pose.length / 2)
          : rectPath(pose.x, pose.y, pose.width, pose.length);
        return [{ kind: 'group', alpha: 0.55, children: [
          { kind: 'path', path, fill: { fill: 'solid', color: '#cfe2ec' } },
          { kind: 'path', path, stroke: { paint: { fill: 'solid', color: '#5BA4CF' }, width: strokeWidth } },
        ]}];
      }

      // zones
      const zone = garden.zones.find((z) => z.id === targetId);
      if (!zone) return [];
      const path = rectPath(pose.x, pose.y, pose.width, pose.length);
      return [{ kind: 'group', alpha: 0.4, children: [
        { kind: 'path', path, fill: { fill: 'solid', color: zone.color } },
        { kind: 'path', path, stroke: { paint: { fill: 'solid', color: '#5BA4CF' }, width: strokeWidth } },
      ]}];
    },

    // No-op: the actual commit lives in `useResize.end()` (called from
    // `useEricSelectTool`'s `drag.onEnd`). Weasel batches the pose change into
    // a single `applyBatch` call → one `gardenStore.checkpoint()` → one undo step.
    commit(_putative: ResizePutative): void {
      // intentional: see file doc comment.
    },
  };
}
