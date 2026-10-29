import type { MoveBehavior, SnapSource } from '@weasel-js/core';
import { gridSnapSource } from '@weasel-js/guides';
import { useGardenStore } from '../../store/gardenStore';
import type { GardenSceneAdapter, SceneNode, ScenePose } from '../adapters/gardenScene';
import { plantingLayoutFor } from '../adapters/plantingLayout';

/**
 * Mapping from Phase 5 deferral vocabulary → eric implementations:
 *
 * - `snapToGrid`        → `structureZoneGridSnap`  (a snap source wrapping
 *                          weasel's `gridSnapSource`, gated to structure/zone
 *                          moves, honours per-structure `snapToGrid: false`;
 *                          the kit's suspend key, Ctrl, bypasses it).
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
 * Order in `useMove`'s `behaviors` list (the grid snap runs before any
 * behavior, in the kit's snap session):
 *   1. clampStructureZoneToGardenBounds  (clamp — final hard guard)
 *   2. detectStructureClash          (warn)
 *   3. requirePlantingDrop           (snap-back on free release)
 *
 * clash needs the post-snap, post-clamp pose to flag overlaps accurately. Planting behaviors are kind-narrowed and never interact with
 * structure/zone behaviors.
 */

/**
 * Grid-snap structure/zone moves to the garden's gridCellSizeFt. Plantings
 * skip this — their pose comes from the container's layout strategy, which
 * has its own slot-based snapping. Per-structure `snapToGrid: false` opts a
 * structure out (free-move).
 */
export function structureZoneGridSnap(adapter: GardenSceneAdapter): SnapSource {
  let grid: { spacing: number; source: SnapSource } | null = null;
  return {
    id: 'garden-grid',
    tier: 'fallback',
    reachPx: Number.POSITIVE_INFINITY,
    roles: ['origin', 'pointer'],
    gestures: ['move'],
    collect(q) {
      const dragged = (q.ids ?? []).map((id) => adapter.getNode(id) as SceneNode | undefined);
      const snaps =
        dragged.length > 0 &&
        dragged.every(
          (n) => n && n.kind !== 'planting' && (n.kind !== 'structure' || n.data.snapToGrid),
        );
      if (!snaps) return [];
      // Re-read spacing each move; the garden grid cell size is editable.
      const spacing = useGardenStore.getState().garden.gridCellSizeFt;
      if (grid?.spacing !== spacing) grid = { spacing, source: gridSnapSource({ spacing }) };
      return grid.source.collect(q);
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
    onEnd(ctx, end) {
      const obj = adapter.getNode(ctx.draggedIds[0]) as SceneNode | undefined;
      if (!obj || obj.kind !== 'planting') return; // non-planting → defer
      const garden = useGardenStore.getState().garden;
      const getGarden = () => garden;
      // The release point in WORLD coords (eric's container geometry is world).
      const point = end.pointer;
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
