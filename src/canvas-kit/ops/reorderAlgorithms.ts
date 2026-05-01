/**
 * Pure reorder primitives. All operate on a flat ordered id list (z-order:
 * index 0 = bottom, last = top) and return a new list. Stable: relative
 * order of moved ids is preserved.
 */

function partition(list: string[], moving: string[]): { kept: string[]; movedInOrder: string[] } {
  const movingSet = new Set(moving);
  const kept: string[] = [];
  const movedInOrder: string[] = [];
  for (const id of list) {
    if (movingSet.has(id)) movedInOrder.push(id);
    else kept.push(id);
  }
  return { kept, movedInOrder };
}

export function bringForward(list: string[], ids: string[]): string[] {
  const movingSet = new Set(ids);
  const out = list.slice();
  // Walk from top down; each moving id swaps up by one if its upper neighbor
  // is not also moving (prevents block from running into itself).
  for (let i = out.length - 2; i >= 0; i--) {
    if (movingSet.has(out[i]) && !movingSet.has(out[i + 1])) {
      const tmp = out[i];
      out[i] = out[i + 1];
      out[i + 1] = tmp;
    }
  }
  return out;
}

export function sendBackward(list: string[], ids: string[]): string[] {
  const movingSet = new Set(ids);
  const out = list.slice();
  for (let i = 1; i < out.length; i++) {
    if (movingSet.has(out[i]) && !movingSet.has(out[i - 1])) {
      const tmp = out[i];
      out[i] = out[i - 1];
      out[i - 1] = tmp;
    }
  }
  return out;
}

export function bringToFront(list: string[], ids: string[]): string[] {
  const { kept, movedInOrder } = partition(list, ids);
  return [...kept, ...movedInOrder];
}

export function sendToBack(list: string[], ids: string[]): string[] {
  const { kept, movedInOrder } = partition(list, ids);
  return [...movedInOrder, ...kept];
}

export function moveToIndex(list: string[], ids: string[], index: number): string[] {
  const { kept, movedInOrder } = partition(list, ids);
  const clamped = Math.max(0, Math.min(kept.length, index));
  return [...kept.slice(0, clamped), ...movedInOrder, ...kept.slice(clamped)];
}
