import {
  type Action,
  createInsertOp,
  createSetSelectionOp,
  type InvocationCtx,
  type NodeId,
  type OngoingHandle,
  type Op,
  type SelectionApi,
} from '@orochi235/weasel';
import type { GardenScene } from '../../scene/gardenScene';
import { useGardenStore } from '../../store/gardenStore';
import { expandToGroups } from '../../utils/groups';
import type { GardenInsertAdapter } from '../adapters/insert';

/**
 * `clone` action — alt-drag-to-duplicate for the garden canvas.
 *
 * ## Why a custom action (not the kit `cloneAction`)
 *
 * The kit select tool already carries the alt-drag→`clone` bindings
 * (`useSelectTool.ts`), so restoring alt-drag clone is a matter of registering
 * an action under the `clone` id (`<SceneCanvas actions={{ clone }}>`). The
 * dispatcher hands every alt-body-drag to it.
 *
 * The kit's default `cloneAction` *almost* fits — it already routes its commit
 * through the consumer `applyOps` dep (which eric registers in
 * `GardenHistoryBridge`, so undo + scene→garden recomposition come for free).
 * But it has two domain gaps eric needs to close:
 *   1. **No group expansion.** Alt-dragging one member of a structure group
 *      should clone the whole group (parity with the move action's `expandIds`
 *      and the retired `useEricCycleTool` clone path).
 *   2. **Plantings need parent re-resolution from the drop point.** The kit
 *      action keeps a planting's original `parent` and translates its local
 *      pose by the world delta — wrong when the planting is dropped into a
 *      different container (or out of one). eric's `insertAdapter.commitPaste`
 *      resolves the new parent from the cursor's world position at drop.
 *
 * So this action mirrors the kit handle's *preview* lifecycle (the dim ghost is
 * rendered by the shared `usePreviewGhostLayer` from `previewIds`/`previewPose`)
 * but commits through eric's proven domain-clone path: snapshot the
 * group-expanded selection → `commitPaste` at the drag offset / drop point →
 * apply the insert + set-selection ops as ONE undo step via
 * `insertAdapter.applyOps` (checkpoint + op.apply). This is the same op shape
 * the retired `cloneByAltDrag` behavior produced.
 *
 * @see docs/behavior.md "Alt+drag clone"
 */
export function createGardenCloneAction(
  insertAdapter: GardenInsertAdapter,
  scene: GardenScene,
): Action & { requires: string[] } {
  return {
    id: 'clone',
    label: 'Clone',
    defaultBinding: { kind: 'drag' },
    // Eligible only where the select tool owns transforms — same capability
    // gate the kit cloneAction uses; survives new modes being added.
    eligible: { capability: ['edits-page', 'creates-selection'] },
    requires: ['selection'],
    invoker: {
      timing: 'ongoing',
      start(ctx: InvocationCtx): OngoingHandle {
        const selection = ctx.deps.selection as SelectionApi | undefined;
        if (!selection) return {};
        const baseIds = selection.get() as string[];
        if (baseIds.length === 0) return {};

        // Expand to group siblings so alt-dragging one grouped structure clones
        // the whole group. Narrow selection stays narrow in the store; we only
        // widen the clone set here (matching `selectTool.move.expandIds`).
        const structures = useGardenStore.getState().garden.structures;
        const ids = expandToGroups(baseIds, structures);
        if (ids.length === 0) return {};

        // Capture origin SCENE poses (parent-LOCAL for contained nodes) for the
        // ghost. Translating a local pose by the WORLD drag delta is correct
        // because eric's local frame is axis-aligned (local = world − parent
        // origin); the preview-ghost layer composes local→world to render. Same
        // approach the kit cloneAction + move ghost use.
        const originPoses = new Map<string, { x: number; y: number }>();
        for (const id of ids) {
          const node = scene.get(id as NodeId);
          if (node) originPoses.set(id, node.pose as { x: number; y: number });
        }

        const previews = new Map<string, unknown>();
        let delta = { dx: 0, dy: 0 };

        return {
          kind: 'clone',
          // Clone: original stays visible at its committed pose; the ghost
          // appears at the drag target.
          previewHidesSource: false,
          onMove(moveCtx: InvocationCtx): void {
            if (!moveCtx.drag) return;
            delta = { dx: moveCtx.drag.delta.x, dy: moveCtx.drag.delta.y };
            previews.clear();
            if (delta.dx === 0 && delta.dy === 0) return;
            for (const [id, origin] of originPoses) {
              previews.set(id, { ...origin, x: origin.x + delta.dx, y: origin.y + delta.dy });
            }
          },
          onEnd(endCtx: InvocationCtx, reason: 'commit' | 'cancel'): void {
            previews.clear();
            if (reason === 'cancel') return;
            const dx = endCtx.drag?.delta.x ?? delta.dx;
            const dy = endCtx.drag?.delta.y ?? delta.dy;
            // Zero-delta drag → no clone.
            if (dx === 0 && dy === 0) return;
            const dropX = endCtx.drag?.current.x ?? endCtx.world.x;
            const dropY = endCtx.drag?.current.y ?? endCtx.world.y;

            // `InsertAdapter`'s base interface marks these optional; eric's
            // concrete adapter always defines them.
            const snap = insertAdapter.snapshotSelection?.(ids) ?? { items: [] };
            const created =
              insertAdapter.commitPaste?.(
                snap,
                { dx, dy },
                { dropPoint: { worldX: dropX, worldY: dropY } },
              ) ?? [];
            if (created.length === 0) return;
            const newIds = created.map((o) => o.id);
            const from = insertAdapter.getSelection?.() ?? [];
            const ops: Op[] = [
              ...created.map((o) => createInsertOp({ node: o })),
              createSetSelectionOp({ from: from as NodeId[], to: newIds as NodeId[] }),
            ];
            // One undo step: checkpoint + apply each op against the insert
            // adapter (insertNode / setSelection). The store's scene
            // subscription recomposes `garden`.
            insertAdapter.applyOps?.(ops, 'Clone');
          },
          previewIds: () => previews.keys(),
          previewPose: (id: string) => previews.get(id) ?? null,
        };
      },
    },
    enabled: () => true,
  };
}
