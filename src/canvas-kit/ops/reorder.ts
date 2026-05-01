import type { Op } from './types';
import {
  bringForward,
  sendBackward,
  bringToFront,
  sendToBack,
  moveToIndex,
} from './reorderAlgorithms';

interface ReorderAdapter {
  getParent?(id: string): string | null;
  getChildren?(parentId: string | null): string[];
  setChildOrder?(parentId: string | null, ids: string[]): void;
}

type ReorderFn = (list: string[], ids: string[]) => string[];

interface RestoreEntry {
  parentId: string | null;
  before: string[];
}

/**
 * Build an op that, on apply, partitions `ids` by their current parent,
 * runs `fn(currentChildren, idsForParent)` per parent, and writes the
 * result back via setChildOrder. Records before-state per parent so invert
 * is exact.
 */
function createPartitionedReorderOp(args: {
  ids: string[];
  fn: ReorderFn;
  label?: string;
}): Op {
  const { ids, fn, label } = args;
  let restore: RestoreEntry[] | null = null;

  return {
    label,
    apply(adapter) {
      const a = adapter as ReorderAdapter;
      if (!a.getChildren || !a.setChildOrder) return; // graceful no-op
      // Partition ids by current parent.
      const byParent = new Map<string | null, string[]>();
      for (const id of ids) {
        const parent = a.getParent ? a.getParent(id) : null;
        const list = byParent.get(parent) ?? [];
        list.push(id);
        byParent.set(parent, list);
      }
      const snapshots: RestoreEntry[] = [];
      for (const [parentId, parentIds] of byParent) {
        const before = a.getChildren(parentId);
        snapshots.push({ parentId, before: before.slice() });
        const after = fn(before, parentIds);
        a.setChildOrder(parentId, after);
      }
      restore = snapshots;
    },
    invert() {
      const captured = restore;
      return {
        label,
        apply(adapter) {
          if (!captured) return;
          const a = adapter as ReorderAdapter;
          if (!a.setChildOrder) return;
          for (const entry of captured) {
            a.setChildOrder(entry.parentId, entry.before.slice());
          }
        },
        invert() {
          // Inverting twice should reapply the original; we don't support
          // this round-trip beyond two levels — the kit's history layer
          // doesn't need it. Return a no-op for safety.
          return { apply() {}, invert() { return this; } };
        },
      };
    },
  };
}

export function createBringForwardOp(args: { ids: string[]; label?: string }): Op {
  return createPartitionedReorderOp({ ids: args.ids, fn: bringForward, label: args.label ?? 'Bring forward' });
}

export function createSendBackwardOp(args: { ids: string[]; label?: string }): Op {
  return createPartitionedReorderOp({ ids: args.ids, fn: sendBackward, label: args.label ?? 'Send backward' });
}

export function createBringToFrontOp(args: { ids: string[]; label?: string }): Op {
  return createPartitionedReorderOp({ ids: args.ids, fn: bringToFront, label: args.label ?? 'Bring to front' });
}

export function createSendToBackOp(args: { ids: string[]; label?: string }): Op {
  return createPartitionedReorderOp({ ids: args.ids, fn: sendToBack, label: args.label ?? 'Send to back' });
}

export function createMoveToIndexOp(args: {
  ids: string[];
  parentId: string | null;
  index: number;
  label?: string;
}): Op {
  const { ids, parentId, index, label } = args;
  let before: string[] | null = null;

  return {
    label: label ?? 'Move to index',
    apply(adapter) {
      const a = adapter as ReorderAdapter;
      if (!a.getChildren || !a.setChildOrder) return;
      // Filter to ids whose current parent matches target parent.
      const eligible = ids.filter((id) => {
        const p = a.getParent ? a.getParent(id) : null;
        return p === parentId;
      });
      const current = a.getChildren(parentId);
      before = current.slice();
      const after = moveToIndex(current, eligible, index);
      a.setChildOrder(parentId, after);
    },
    invert() {
      const captured = before;
      return {
        label,
        apply(adapter) {
          if (!captured) return;
          const a = adapter as ReorderAdapter;
          a.setChildOrder?.(parentId, captured.slice());
        },
        invert() { return { apply() {}, invert() { return this; } }; },
      };
    },
  };
}
