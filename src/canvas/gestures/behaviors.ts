/**
 * Vendored gesture behaviors (pin copies).
 *
 * - `cloneByAltDrag` — clone selection on alt-drag (for `useClone`).
 * - `selectFromMarquee` — default marquee selection (for `useAreaSelect`).
 * - `snapToGrid` / `snapBackOrDelete` — move behaviors eric's
 *   `snapMoveBehaviors` wraps. These previously came from
 *   `@orochi235/weasel/move`, but HEAD's versions return the diverged
 *   `{ transform }` contract; eric's behaviors are built on the pin's
 *   `{ pose }` contract, so the needed pin code paths are vendored here
 *   (numeric-spacing grid snap, rect origin projection — the kit's
 *   `core/units` / `DebugSink` plumbing is dropped as eric never used it).
 *
 * Op factories (`createInsertOp`, `createSetSelectionOp`, `createDeleteOp`)
 * and `NodeId` remain HEAD-public and are imported from the kit.
 */
import {
  type AreaSelectAdapter,
  createDeleteOp,
  createInsertOp,
  createSetSelectionOp,
  type NodeId,
  type Op,
} from '@orochi235/weasel';
import type { AreaSelectBehavior, CloneBehavior, ModifierState, MoveBehavior } from './types';

type ModKey = keyof ModifierState;

// ----- clone -----

/** Clone-on-alt-drag behavior for `useClone`; activates when Alt/Option is held at drag start. */
export function cloneByAltDrag(): CloneBehavior {
  return {
    id: 'cloneByAltDrag',
    activates: (mods) => mods.alt === true,
    onEnd(pose, ctx) {
      const snap = ctx.adapter.snapshotSelection?.(pose.ids) ?? { items: [] };
      const created =
        ctx.adapter.commitPaste?.(snap, pose.offset, {
          dropPoint: { worldX: pose.worldX, worldY: pose.worldY },
        }) ?? [];
      if (created.length === 0) return [];
      const newIds = created.map((o: { id: string }) => o.id);
      const from = ctx.adapter.getSelection?.() ?? [];
      return [
        ...created.map((o) => createInsertOp({ node: o })),
        createSetSelectionOp({ from: from as NodeId[], to: newIds as NodeId[] }),
      ];
    },
  };
}

// ----- area-select -----

/** Default area-select behavior: replace selection with hits inside the marquee, or extend with shift held. */
export function selectFromMarquee(): AreaSelectBehavior {
  return {
    defaultTransient: true,
    onEnd(ctx) {
      const adapter = ctx.adapter as unknown as AreaSelectAdapter;
      if (!adapter.getSelection || !adapter.hitTestArea) return null;
      const start = ctx.origin.get('gesture')!;
      const current = ctx.current.get('gesture') ?? start;
      const x = Math.min(start.worldX, current.worldX);
      const y = Math.min(start.worldY, current.worldY);
      const width = Math.abs(current.worldX - start.worldX);
      const height = Math.abs(current.worldY - start.worldY);

      const from = adapter.getSelection();
      const isEmpty = width === 0 || height === 0;
      const shiftHeld = start.shiftHeld;

      let to: string[];
      if (isEmpty) {
        to = shiftHeld ? from : [];
      } else {
        const hits = adapter.hitTestArea({ x, y, width, height });
        if (shiftHeld) {
          const merged = [...from];
          for (const id of hits) if (!merged.includes(id)) merged.push(id);
          to = merged;
        } else {
          to = hits;
        }
      }
      const ops: Op[] = [createSetSelectionOp({ from: from as NodeId[], to: to as NodeId[] })];
      return ops;
    },
  };
}

// ----- move: grid snap -----

/**
 * Snap-strategy that rounds the pose's origin to the nearest multiple of
 * `spacing`. Rect-origin only (the only case eric uses).
 */
function snapToGridPose<TPose extends { x: number; y: number }>(
  pose: TPose,
  spacing: number,
): TPose {
  const sx = Math.round(pose.x / spacing) * spacing;
  const sy = Math.round(pose.y / spacing) * spacing;
  return { ...pose, x: sx, y: sy };
}

/** Move behavior: snap the dragged pose's origin to a `spacing` grid; `bypassKey` skips it. */
export function snapToGrid<TPose extends { x: number; y: number }>(args: {
  spacing: number;
  bypassKey?: ModKey;
}): MoveBehavior<TPose> {
  const { spacing, bypassKey } = args;
  return {
    onMove(ctx, proposed) {
      if (bypassKey && ctx.modifiers[bypassKey]) return;
      return { pose: snapToGridPose(proposed, spacing) };
    },
  };
}

// ----- move: snap-back-or-delete -----

/**
 * Move behavior: when the gesture ends with no active snap target and the
 * dragged origin moved beyond `radius`, either abort (snap-back, returns null)
 * or delete the node. eric uses `radius: Infinity` + `'snap-back'`, so the
 * delete branch (and its `createDeleteOp` import) is parity-only.
 */
export function snapBackOrDelete<TPose extends { x: number; y: number }>(args: {
  radius: number;
  onFreeRelease: 'snap-back' | 'delete';
  deleteLabel?: string;
}): MoveBehavior<TPose> {
  const { radius, onFreeRelease, deleteLabel = 'Delete' } = args;
  const r2 = radius * radius;

  return {
    onStart(ctx) {
      const snapshots = new Map<string, { id: string }>();
      for (const id of ctx.draggedIds) {
        const obj = ctx.adapter.getNode(id) ?? { id };
        snapshots.set(id, obj);
      }
      ctx.scratch['snapBackOrDelete.snapshots'] = snapshots;
    },

    onEnd(ctx) {
      if (ctx.snap) return;
      const id = ctx.draggedIds[0];
      const o0 = ctx.origin.get(id)!;
      const o1 = ctx.current.get(id)!;
      const dx = o1.x - o0.x;
      const dy = o1.y - o0.y;
      const within = dx * dx + dy * dy <= r2;
      if (within) {
        return null;
      }
      if (onFreeRelease === 'delete') {
        const snapshots = ctx.scratch['snapBackOrDelete.snapshots'] as
          | Map<string, { id: string }>
          | undefined;
        const obj = snapshots?.get(id) ?? { id };
        const ops: Op[] = [createDeleteOp({ node: obj, index: 0, label: deleteLabel })];
        return ops;
      }
      return;
    },
  };
}
