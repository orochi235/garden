import type { Drag, DragPointerSample, DragViewport } from './putativeDrag';
import { useGardenStore } from '../../store/gardenStore';
import { getCultivar } from '../../model/cultivars';
import { renderPlant } from '../plantRenderers';

/**
 * Phase-2-migrated drag: structure / zone / planting move (single + multi-select).
 *
 * **Approach: Option A — façade over weasel's `useMove`.** The actual gesture
 * engine is still `useMove` inside `useEricSelectTool`: it owns state, runs
 * `MoveBehavior`s (snap, clamp, clash, snap-back), and produces the post-snap
 * pose map every move. We don't go through `useDragController.start()` because
 * the move drag is invoked from inside a kit Tool (whose canvas already owns
 * pointer routing) — we'd be double-handling pointer events.
 *
 * Instead, `useEricSelectTool` mirrors `move.overlay` into
 * `uiStore.dragPreview` on each frame, and this `Drag.renderPreview` becomes
 * the canonical drawer. The framework's `dragPreviewLayer` dispatches to it.
 *
 * `compute` is purely informational here (the framework's controller never
 * calls it for this drag — we publish to the slot directly). It's exported as
 * an identity transform so the `Drag<T,U>` shape is honored and tests can
 * exercise the rendering path with a hand-rolled putative.
 *
 * The "watch out" item from the framework spec — *no mid-flight store
 * mutation* — is satisfied: weasel's `useMove` already keeps everything in
 * its own controller state and only writes through on `end()` via
 * `dispatchApplyBatch` → `adapter.applyBatch` (single `checkpoint()` + ops),
 * producing one undo step. The transient `dragClashIds` slot remains a
 * render-only signal; clash highlighting is a render concern (read here in
 * the per-id ghost rendering code path) that doesn't affect undo.
 */

/** What gets fed into compute. Today identical to the putative — see file
 *  doc comment. */
export interface MoveInput {
  draggedIds: string[];
  posesById: Array<[string, { x: number; y: number }]>;
  destContainerId: string | null;
  accepted: boolean;
}

/** What `useEricSelectTool` writes into `uiStore.dragPreview` on every move. */
export interface MovePutative {
  /** Ids in the drag set, primary first. */
  draggedIds: string[];
  /**
   * Final per-id world pose (post-snap, post-clamp). Stored as an array of
   * tuples so the putative is structurally serializable / shallow-comparable
   * by the slot consumer; reconstructed into a Map at render time.
   */
  posesById: Array<[string, { x: number; y: number }]>;
  /** Container/zone the drag is currently over (for highlight chrome). */
  destContainerId: string | null;
  /** Whether the destination layout accepted the drop point. */
  accepted: boolean;
}

export const MOVE_DRAG_KIND = 'eric-move';

export function createMoveDrag(): Drag<MoveInput, MovePutative> {
  return {
    kind: MOVE_DRAG_KIND,

    // The framework controller doesn't drive this drag — the Tool publishes
    // putatives to `dragPreview` directly. `read` and `compute` exist to
    // satisfy the `Drag<T, U>` contract and to keep tests easy.
    read(_sample: DragPointerSample, _viewport: DragViewport): MoveInput {
      return { draggedIds: [], posesById: [], destContainerId: null, accepted: true };
    },

    compute(input: MoveInput): MovePutative | null {
      if (input.draggedIds.length === 0) return null;
      return {
        draggedIds: input.draggedIds,
        posesById: input.posesById,
        destContainerId: input.destContainerId,
        accepted: input.accepted,
      };
    },

    /**
     * Draws the ghost layout: per-id translucent plant icons (and structure /
     * zone outlines) at the post-snap pose, plus a snap-target outline on the
     * destination container when one is engaged.
     *
     * The framework's `dragPreviewLayer` runs in WORLD space (its `RenderLayer`
     * is registered without `space: 'screen'`). We draw in world units; the
     * `view` is provided for things that should stay screen-constant (none
     * here — strokes are intentionally world-scaled to match the legacy look).
     */
    renderPreview(ctx, putative, _view): void {
      const garden = useGardenStore.getState().garden;
      const poses = new Map(putative.posesById);

      // Snap-target outline on the destination container/zone.
      if (putative.accepted && putative.destContainerId) {
        const c =
          garden.structures.find((s) => s.id === putative.destContainerId) ??
          garden.zones.find((z) => z.id === putative.destContainerId);
        if (c) {
          ctx.save();
          ctx.strokeStyle = '#5BA4CF';
          // Stroke width and dash sizes are intentionally tiny in world feet
          // so they read as a ~2px dashed outline at typical zooms.
          ctx.lineWidth = 2 / Math.max(0.0001, _view.scale);
          const dash = 6 / Math.max(0.0001, _view.scale);
          const gap = 4 / Math.max(0.0001, _view.scale);
          ctx.setLineDash([dash, gap]);
          if ((c as { shape?: string }).shape === 'circle') {
            ctx.beginPath();
            ctx.ellipse(c.x + c.width / 2, c.y + c.length / 2, c.width / 2, c.length / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.strokeRect(c.x, c.y, c.width, c.length);
          }
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // Per-id ghosts. Plantings render as their cultivar icon at footprint
      // radius; structures and zones render as a translucent body outline.
      for (const id of putative.draggedIds) {
        const pose = poses.get(id);
        if (!pose) continue;

        const planting = garden.plantings.find((p) => p.id === id);
        if (planting) {
          const cultivar = getCultivar(planting.cultivarId);
          if (!cultivar) continue;
          const footprintFt = cultivar.footprintFt ?? 0.5;
          ctx.save();
          ctx.globalAlpha = 0.65;
          ctx.translate(pose.x, pose.y);
          renderPlant(ctx, planting.cultivarId, footprintFt / 2, cultivar.color);
          ctx.restore();
          continue;
        }

        const structure = garden.structures.find((s) => s.id === id);
        if (structure) {
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#cfe2ec';
          ctx.strokeStyle = '#5BA4CF';
          ctx.lineWidth = 1.5 / Math.max(0.0001, _view.scale);
          if ((structure as { shape?: string }).shape === 'circle') {
            ctx.beginPath();
            ctx.ellipse(
              pose.x + structure.width / 2,
              pose.y + structure.length / 2,
              structure.width / 2,
              structure.length / 2,
              0,
              0,
              Math.PI * 2,
            );
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillRect(pose.x, pose.y, structure.width, structure.length);
            ctx.strokeRect(pose.x, pose.y, structure.width, structure.length);
          }
          ctx.restore();
          continue;
        }

        const zone = garden.zones.find((z) => z.id === id);
        if (zone) {
          ctx.save();
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = zone.color;
          ctx.strokeStyle = '#5BA4CF';
          ctx.lineWidth = 1.5 / Math.max(0.0001, _view.scale);
          ctx.fillRect(pose.x, pose.y, zone.width, zone.length);
          ctx.strokeRect(pose.x, pose.y, zone.width, zone.length);
          ctx.restore();
          continue;
        }
      }
    },

    // No-op: the actual commit lives in `useMove.end()` (called from
    // `useEricSelectTool`'s `drag.onEnd`). Weasel batches all pose changes
    // into a single `applyBatch` call so the move is a single undo step.
    commit(_putative: MovePutative): void {
      // intentional: see file doc comment.
    },
  };
}
