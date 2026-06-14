import { useGardenStore } from '../../store/gardenStore';
import type { GardenSceneAdapter, SceneNode, ScenePose } from '../adapters/gardenScene';
import {
  type MoveBehavior,
  snapBackOrDelete as weaselSnapBackOrDelete,
  snapToGrid as weaselSnapToGrid,
} from '../gestures';

/**
 * Mapping from Phase 5 deferral vocabulary → eric implementations:
 *
 * - `snapToGrid`        → `snapStructureZoneToGrid`  (wraps weasel's `snapToGrid`,
 *                          gated to structures/zones, honours per-structure
 *                          `snapToGrid: false`, alt bypasses).
 * - `snapToContainer`   → `trackPlantingSnap` (kept in useEricSelectTool.ts).
 *                          Eric does NOT use weasel's generic `snapToContainer`
 *                          because the in-flight visual is owned by the layout
 *                          strategy (see `getLayout()`); we only need to mirror
 *                          the active snap target into `ctx.snap` so the
 *                          snap-back behavior below can read it.
 * - `snapBackOrDelete`  → `requirePlantingDrop` (this file). Wraps weasel's
 *                          `snapBackOrDelete` with an infinite radius and
 *                          `'snap-back'` policy, gated to plantings. Plantings
 *                          released over no container abort the gesture. Policy
 *                          is *snap-back* (legacy parity — see `docs/behavior.md`
 *                          "Existing seedlings ... dropping outside the tray
 *                          removes the seedling" only applies to the seed-
 *                          starting view, not the garden); structures/zones are
 *                          hard-clamped to bounds and never go OOB to need
 *                          this behavior.
 *
 * Order in `useMove`'s `behaviors` list:
 *   1. snapStructureZoneToGrid       (snap)
 *   2. clampStructureZoneToGardenBounds  (clamp — final hard guard)
 *   3. detectStructureClash          (warn)
 *   4. trackPlantingSnap             (mirror snap into ctx)
 *   5. requirePlantingDrop           (snap-back on free release)
 *
 * snap → clamp: clamp is the last word on position, so it runs after snap.
 * snap → clash: clash needs the post-snap, post-clamp pose to flag overlaps
 * accurately. Planting behaviors are kind-narrowed and never interact with
 * structure/zone behaviors.
 */

/**
 * Grid-snap structure/zone moves to the garden's gridCellSizeFt. Plantings
 * skip this — their pose comes from the container's layout strategy, which
 * has its own slot-based snapping. The Alt key bypasses snap. Per-structure
 * `snapToGrid: false` opts a structure out (free-move).
 */
export function snapStructureZoneToGrid(adapter: GardenSceneAdapter): MoveBehavior<ScenePose> {
  return {
    onMove(ctx, proposed) {
      const obj = adapter.getNode(ctx.draggedIds[0]) as SceneNode | undefined;
      if (!obj || obj.kind === 'planting') return;
      const shouldSnap = obj.kind === 'structure' ? obj.data.snapToGrid : true;
      if (!shouldSnap) return;
      // Re-read spacing each move; the garden grid cell size is editable.
      const inner = weaselSnapToGrid<ScenePose>({
        spacing: useGardenStore.getState().garden.gridCellSizeFt,
        bypassKey: 'alt',
      });
      return inner.onMove?.(ctx, proposed);
    },
  };
}

/**
 * Snap-back: if a planting is released over no snap target, cancel the
 * gesture so the plant reverts to its origin instead of free-committing in
 * empty space. Wraps weasel's `snapBackOrDelete` with `radius: Infinity`
 * (any release with no snap aborts) and `'snap-back'` policy.
 */
export function requirePlantingDrop(adapter: GardenSceneAdapter): MoveBehavior<ScenePose> {
  // Infinity radius → any no-snap release counts as "within radius" → returns
  // null (gesture aborted). Snap-back policy → never deletes.
  const inner = weaselSnapBackOrDelete<ScenePose>({
    radius: Number.POSITIVE_INFINITY,
    onFreeRelease: 'snap-back',
  });
  return {
    onStart(ctx) {
      const obj = adapter.getNode(ctx.draggedIds[0]) as SceneNode | undefined;
      if (!obj || obj.kind !== 'planting') return;
      inner.onStart?.(ctx);
    },
    onEnd(ctx) {
      const obj = adapter.getNode(ctx.draggedIds[0]) as SceneNode | undefined;
      if (!obj || obj.kind !== 'planting') return;
      // `ctx.snap` is set by `findSnapContainer`'s attraction radius, which
      // reaches BEYOND the container bounds. The move's layout pass only
      // commits a drop when the dragged center is *inside* the container, so an
      // attraction-only release (cursor outside the bounds) commits nothing —
      // and the controller would otherwise fall through to a raw-pose commit,
      // stranding the planting at the cursor ("an odd place in the container").
      // Plantings are slot-bound; treat an attraction-only snap as a free
      // release so it snaps back to origin instead.
      const snap = ctx.snap;
      const cursorInside =
        (snap?.metadata as { cursorInside?: boolean } | undefined)?.cursorInside === true;
      if (snap && !cursorInside) {
        return inner.onEnd?.({ ...ctx, snap: null });
      }
      return inner.onEnd?.(ctx);
    },
  };
}
