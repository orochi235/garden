import type { Drag, DragPointerSample, DragViewport } from './putativeDrag';
import { useGardenStore } from '../../store/gardenStore';

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
    renderPreview(ctx, putative, view): void {
      const garden = useGardenStore.getState().garden;
      const { pose, layer, targetId } = putative;

      if (layer === 'structures') {
        const structure = garden.structures.find((s) => s.id === targetId);
        if (!structure) return;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#cfe2ec';
        ctx.strokeStyle = '#5BA4CF';
        ctx.lineWidth = 1.5 / Math.max(0.0001, view.scale);
        if ((structure as { shape?: string }).shape === 'circle') {
          ctx.beginPath();
          ctx.ellipse(
            pose.x + pose.width / 2,
            pose.y + pose.length / 2,
            pose.width / 2,
            pose.length / 2,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(pose.x, pose.y, pose.width, pose.length);
          ctx.strokeRect(pose.x, pose.y, pose.width, pose.length);
        }
        ctx.restore();
        return;
      }

      // zones
      const zone = garden.zones.find((z) => z.id === targetId);
      if (!zone) return;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = zone.color;
      ctx.strokeStyle = '#5BA4CF';
      ctx.lineWidth = 1.5 / Math.max(0.0001, view.scale);
      ctx.fillRect(pose.x, pose.y, pose.width, pose.length);
      ctx.strokeRect(pose.x, pose.y, pose.width, pose.length);
      ctx.restore();
    },

    // No-op: the actual commit lives in `useResize.end()` (called from
    // `useEricSelectTool`'s `drag.onEnd`). Weasel batches the pose change into
    // a single `applyBatch` call → one `gardenStore.checkpoint()` → one undo step.
    commit(_putative: ResizePutative): void {
      // intentional: see file doc comment.
    },
  };
}
