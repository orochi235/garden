import type { MoveBehavior } from '@orochi235/weasel';
import { snapToGrid as weaselSnapToGrid } from '@orochi235/weasel/move';
import { useGardenStore } from '../../store/gardenStore';
import type { GardenSceneAdapter, SceneNode, ScenePose } from '../adapters/gardenScene';
import { plantingLayoutFor } from '../adapters/plantingLayout';

/**
 * Mapping from Phase 5 deferral vocabulary → eric implementations:
 *
 * - `snapToGrid`        → `snapStructureZoneToGrid`  (wraps weasel's `snapToGrid`,
 *                          gated to structures/zones, honours per-structure
 *                          `snapToGrid: false`, alt bypasses).
 * - `snapToContainer`   → `trackPlantingSnap` (this file).
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
 * empty space.
 *
 * This behavior is a thin slot-bound GUARD that DEFERS to the kit's container
 * layout system (`layouts` / `LayoutStrategy.commitDrop`): when the cursor is
 * released over a container the layout would accept, it returns `undefined`
 * (defer) so the kit's `commitDrop` owns the in-bounds drop + reparent. Only a
 * release in free space returns `null` (abort → snap back to origin). It uses
 * the SAME acceptance test as the kit layout pass (`plantingLayoutFor.contains`)
 * so the two never disagree — the previous version ran a parallel snap system
 * (`trackPlantingSnap` + `findSnapTarget`) that claimed the commit first and
 * stopped the kit layout from ever committing.
 */
export function requirePlantingDrop(adapter: GardenSceneAdapter): MoveBehavior<ScenePose> {
  return {
    onEnd(ctx) {
      const obj = adapter.getNode(ctx.draggedIds[0]) as SceneNode | undefined;
      if (!obj || obj.kind !== 'planting') return; // non-planting → defer
      const garden = useGardenStore.getState().garden;
      const getGarden = () => garden;
      // The release point in WORLD coords (eric's container geometry is world).
      const point = { x: ctx.pointer.worldX, y: ctx.pointer.worldY };
      // Released over any container whose layout would accept this drop?
      // (Same `contains` the kit's layout pass uses, so we agree with it.)
      const overAcceptingContainer = [...garden.structures, ...garden.zones].some((c) => {
        const layout = plantingLayoutFor(getGarden, c.id);
        return layout?.contains?.({ x: 0, y: 0 }, point) === true;
      });
      // Defer → kit `commitDrop` lands it in the slot. Free space → snap back.
      return overAcceptingContainer ? undefined : null;
    },
  };
}
