# canvas-kit Sibling Z-Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add sibling z-order to canvas-kit via array-order adapter contract,
five reorder ops, and a `useReorderAction` hook with bracket keybindings.
Group `members[]` is wired to the same contract.

**Spec:** `docs/superpowers/specs/2026-05-01-canvas-kit-sibling-zorder-design.md`.

**Conventions enforced throughout:**
- Array order **is** z-order: index 0 = bottom, last = top.
- Hit-testing iterates `getChildren` **reversed** (top → bottom).
- Render layers iterate `getChildren` **forward** (bottom → top).
- `getChildren`/`setChildOrder` are **optional** on the adapter; ops and
  hooks no-op when absent.

---

### Task 1: Adapter contract — `OrderedAdapter`

Add an `OrderedAdapter` interface with optional `getChildren` and
`setChildOrder`. Reference it as a structural mixin in `SceneAdapter`'s docs;
the new methods stay optional so existing adapters keep compiling.

**Files:**
- Modify: `src/canvas-kit/adapters/types.ts`
- Create: `src/canvas-kit/adapters/types.test.ts` (only if no test file exists; otherwise extend existing)

- [ ] **Step 1.1: Append the interface to `adapters/types.ts`**

Append at the bottom of `src/canvas-kit/adapters/types.ts`:

```ts
/**
 * Optional adapter mixin for sibling z-order.
 *
 * Both methods are optional. Reorder ops and `useReorderAction` no-op when
 * either is absent — adopt z-order incrementally without breaking existing
 * adapters.
 *
 * **Convention:** array order IS z-order. Index 0 is the bottom of the
 * stack, the last index is the top. Hit-testing should iterate the returned
 * list in REVERSE (top to bottom). Render layers iterate FORWARD (bottom to
 * top).
 *
 * For groups, `parentId` may be a group id; the group adapter routes
 * `getChildren`/`setChildOrder` to the group's `members[]` array.
 */
export interface OrderedAdapter {
  /** Ordered children of `parentId` (or root siblings if null), in z-order:
   *  index 0 is bottom, last index is top. */
  getChildren?(parentId: string | null): string[];

  /** Rewrite the order of `parentId`'s children. Length and contents must
   *  match the existing children — reorder only, no add/remove. */
  setChildOrder?(parentId: string | null, ids: string[]): void;
}
```

- [ ] **Step 1.2: Add a type-only test**

Create `src/canvas-kit/adapters/orderedAdapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { OrderedAdapter } from './types';

describe('OrderedAdapter', () => {
  it('accepts an empty implementation (both methods optional)', () => {
    const a: OrderedAdapter = {};
    expect(a).toBeDefined();
  });

  it('accepts an implementation with both methods', () => {
    const a: OrderedAdapter = {
      getChildren: (p) => (p === null ? ['a', 'b'] : []),
      setChildOrder: () => {},
    };
    expect(a.getChildren?.(null)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 1.3: Run + commit**

```
npm test -- --run src/canvas-kit/adapters/orderedAdapter.test.ts
npm run build
git add src/canvas-kit/adapters/types.ts src/canvas-kit/adapters/orderedAdapter.test.ts
git commit -m "feat(canvas-kit): add OrderedAdapter mixin for sibling z-order"
```

---

### Task 2: Pure reorder algorithms (no adapter, no ops)

Pull the reordering math into a tiny pure module. Five functions: each takes
the current ordered list plus the moving ids, returns the new ordered list.
Easy to TDD without any adapter mocking.

**Files:**
- Create: `src/canvas-kit/ops/reorderAlgorithms.ts`
- Create: `src/canvas-kit/ops/reorderAlgorithms.test.ts`

- [ ] **Step 2.1: Write failing tests**

`src/canvas-kit/ops/reorderAlgorithms.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  bringForward,
  sendBackward,
  bringToFront,
  sendToBack,
  moveToIndex,
} from './reorderAlgorithms';

describe('bringForward', () => {
  it('moves a single id up one slot', () => {
    expect(bringForward(['a', 'b', 'c', 'd'], ['b'])).toEqual(['a', 'c', 'b', 'd']);
  });

  it('no-op when id is already top', () => {
    expect(bringForward(['a', 'b', 'c'], ['c'])).toEqual(['a', 'b', 'c']);
  });

  it('multi-id preserves relative order, bubbles each up one', () => {
    expect(bringForward(['a', 'b', 'c', 'd', 'e'], ['b', 'd'])).toEqual(['a', 'c', 'b', 'e', 'd']);
  });

  it('multi-id at top: top id stays, lower ones still bubble', () => {
    expect(bringForward(['a', 'b', 'c'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(bringForward(['a', 'b', 'c', 'd'], ['c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
    expect(bringForward(['a', 'b', 'c', 'd'], ['b', 'd'])).toEqual(['a', 'c', 'b', 'd']);
  });

  it('skips ids that are not in the list', () => {
    expect(bringForward(['a', 'b', 'c'], ['x', 'b'])).toEqual(['a', 'c', 'b']);
  });
});

describe('sendBackward', () => {
  it('moves a single id down one slot', () => {
    expect(sendBackward(['a', 'b', 'c', 'd'], ['c'])).toEqual(['a', 'c', 'b', 'd']);
  });

  it('no-op when id is already bottom', () => {
    expect(sendBackward(['a', 'b', 'c'], ['a'])).toEqual(['a', 'b', 'c']);
  });

  it('multi-id preserves relative order, drops each down one', () => {
    expect(sendBackward(['a', 'b', 'c', 'd', 'e'], ['b', 'd'])).toEqual(['b', 'a', 'd', 'c', 'e']);
  });
});

describe('bringToFront', () => {
  it('moves a single id to the end (top)', () => {
    expect(bringToFront(['a', 'b', 'c', 'd'], ['b'])).toEqual(['a', 'c', 'd', 'b']);
  });

  it('multi-id lands contiguously at the end, preserves relative order', () => {
    expect(bringToFront(['a', 'b', 'c', 'd', 'e'], ['b', 'd'])).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('skips ids not in the list', () => {
    expect(bringToFront(['a', 'b'], ['x'])).toEqual(['a', 'b']);
  });
});

describe('sendToBack', () => {
  it('moves a single id to the start (bottom)', () => {
    expect(sendToBack(['a', 'b', 'c', 'd'], ['c'])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('multi-id lands contiguously at the start, preserves relative order', () => {
    expect(sendToBack(['a', 'b', 'c', 'd', 'e'], ['b', 'd'])).toEqual(['b', 'd', 'a', 'c', 'e']);
  });
});

describe('moveToIndex', () => {
  it('places ids contiguously starting at index, preserves relative order', () => {
    expect(moveToIndex(['a', 'b', 'c', 'd', 'e'], ['a', 'd'], 2)).toEqual(['b', 'c', 'a', 'd', 'e']);
  });

  it('clamps index to valid range', () => {
    expect(moveToIndex(['a', 'b', 'c'], ['a'], 99)).toEqual(['b', 'c', 'a']);
    expect(moveToIndex(['a', 'b', 'c'], ['c'], -5)).toEqual(['c', 'a', 'b']);
  });

  it('skips ids not in the list', () => {
    expect(moveToIndex(['a', 'b', 'c'], ['x', 'a'], 1)).toEqual(['b', 'a', 'c']);
  });
});
```

- [ ] **Step 2.2: Run — fail (module not found)**

```
npm test -- --run src/canvas-kit/ops/reorderAlgorithms.test.ts
```

- [ ] **Step 2.3: Implement**

`src/canvas-kit/ops/reorderAlgorithms.ts`:

```ts
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
```

- [ ] **Step 2.4: Run — pass + commit**

```
npm test -- --run src/canvas-kit/ops/reorderAlgorithms.test.ts
npm run build
git add src/canvas-kit/ops/reorderAlgorithms.ts src/canvas-kit/ops/reorderAlgorithms.test.ts
git commit -m "feat(canvas-kit): add pure reorder algorithms for sibling z-order"
```

---

### Task 3: Reorder op factories

Five op factories that wrap the algorithms with adapter calls and invert
support. Each captures the before/after order per affected parent so undo is
exact.

**Files:**
- Create: `src/canvas-kit/ops/reorder.ts`
- Create: `src/canvas-kit/ops/reorder.test.ts`
- Modify: `src/canvas-kit/ops/index.ts` (export the new factories)

- [ ] **Step 3.1: Write failing tests**

`src/canvas-kit/ops/reorder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createBringForwardOp,
  createSendBackwardOp,
  createBringToFrontOp,
  createSendToBackOp,
  createMoveToIndexOp,
} from './reorder';

interface FakeAdapter {
  parents: Record<string, string | null>;
  children: Record<string, string[]>; // key 'ROOT' for null
  getParent(id: string): string | null;
  getChildren(parentId: string | null): string[];
  setChildOrder(parentId: string | null, ids: string[]): void;
}

function makeAdapter(init: { parents: Record<string, string | null>; children: Record<string, string[]> }): FakeAdapter {
  const a: FakeAdapter = {
    parents: { ...init.parents },
    children: Object.fromEntries(Object.entries(init.children).map(([k, v]) => [k, v.slice()])),
    getParent(id) { return this.parents[id] ?? null; },
    getChildren(parentId) { return (this.children[parentId ?? 'ROOT'] ?? []).slice(); },
    setChildOrder(parentId, ids) { this.children[parentId ?? 'ROOT'] = ids.slice(); },
  };
  return a;
}

describe('createBringForwardOp', () => {
  it('moves selected id up one slot among its siblings', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    createBringForwardOp({ ids: ['a'] }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'a', 'c']);
  });

  it('partitions multi-parent selection: each parent reorders independently', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, x: 'g1', y: 'g1' },
      children: { ROOT: ['a', 'b'], g1: ['x', 'y'] },
    });
    createBringForwardOp({ ids: ['a', 'x'] }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'a']);
    expect(a.children.g1).toEqual(['y', 'x']);
  });

  it('invert restores the previous order per parent', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    const op = createBringForwardOp({ ids: ['a'] });
    op.apply(a);
    op.invert().apply(a);
    expect(a.children.ROOT).toEqual(['a', 'b', 'c']);
  });

  it('no-ops when getChildren is missing on adapter', () => {
    const stub = {
      getParent: () => null,
      // no getChildren / setChildOrder
    };
    expect(() => createBringForwardOp({ ids: ['a'] }).apply(stub)).not.toThrow();
  });

  it('skips ids not present in their reported parent\'s children', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, ghost: null },
      children: { ROOT: ['a', 'b'] }, // ghost is not actually here
    });
    createBringForwardOp({ ids: ['ghost', 'a'] }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'a']);
  });
});

describe('createSendBackwardOp', () => {
  it('moves selected id down one slot', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    createSendBackwardOp({ ids: ['c'] }).apply(a);
    expect(a.children.ROOT).toEqual(['a', 'c', 'b']);
  });

  it('invert restores the previous order', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    const op = createSendBackwardOp({ ids: ['c'] });
    op.apply(a);
    op.invert().apply(a);
    expect(a.children.ROOT).toEqual(['a', 'b', 'c']);
  });
});

describe('createBringToFrontOp', () => {
  it('moves ids to the end preserving relative order', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null, d: null },
      children: { ROOT: ['a', 'b', 'c', 'd'] },
    });
    createBringToFrontOp({ ids: ['a', 'c'] }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'd', 'a', 'c']);
  });

  it('invert round-trips', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    const op = createBringToFrontOp({ ids: ['a'] });
    op.apply(a);
    op.invert().apply(a);
    expect(a.children.ROOT).toEqual(['a', 'b', 'c']);
  });
});

describe('createSendToBackOp', () => {
  it('moves ids to the start preserving relative order', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null, d: null },
      children: { ROOT: ['a', 'b', 'c', 'd'] },
    });
    createSendToBackOp({ ids: ['b', 'd'] }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('createMoveToIndexOp', () => {
  it('places ids at index, preserving relative order', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null, d: null, e: null },
      children: { ROOT: ['a', 'b', 'c', 'd', 'e'] },
    });
    createMoveToIndexOp({ ids: ['a', 'd'], parentId: null, index: 2 }).apply(a);
    expect(a.children.ROOT).toEqual(['b', 'c', 'a', 'd', 'e']);
  });

  it('skips ids whose current parent does not match the target parent', () => {
    const a = makeAdapter({
      parents: { a: null, x: 'g1' },
      children: { ROOT: ['a'], g1: ['x'] },
    });
    createMoveToIndexOp({ ids: ['a', 'x'], parentId: null, index: 0 }).apply(a);
    expect(a.children.ROOT).toEqual(['a']);
    expect(a.children.g1).toEqual(['x']);
  });

  it('invert restores the prior order', () => {
    const a = makeAdapter({
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    const op = createMoveToIndexOp({ ids: ['c'], parentId: null, index: 0 });
    op.apply(a);
    op.invert().apply(a);
    expect(a.children.ROOT).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 3.2: Run — fail (module not found)**

```
npm test -- --run src/canvas-kit/ops/reorder.test.ts
```

- [ ] **Step 3.3: Implement**

`src/canvas-kit/ops/reorder.ts`:

```ts
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
```

- [ ] **Step 3.4: Wire op barrel**

In `src/canvas-kit/ops/index.ts`, append:

```ts
export {
  createBringForwardOp,
  createSendBackwardOp,
  createBringToFrontOp,
  createSendToBackOp,
  createMoveToIndexOp,
} from './reorder';
```

- [ ] **Step 3.5: Run — pass + commit**

```
npm test -- --run src/canvas-kit/ops/reorder.test.ts
npm run build
git add src/canvas-kit/ops/reorder.ts src/canvas-kit/ops/reorder.test.ts src/canvas-kit/ops/index.ts
git commit -m "feat(canvas-kit): add reorder op factories (bringForward, sendBackward, toFront, toBack, moveToIndex)"
```

---

### Task 4: Group adapter integration

When `parentId` is a group id, route `getChildren`/`setChildOrder` to the
group's `members[]` array. The kit's group adapter doesn't ship a default
implementation today (consumers wire their own); add a helper that adapters
can compose.

**Files:**
- Modify: `src/canvas-kit/groups/types.ts` (extend `GroupAdapter` docs only — no signature change required)
- Create: `src/canvas-kit/groups/orderedGroups.ts`
- Create: `src/canvas-kit/groups/orderedGroups.test.ts`
- Modify: `src/canvas-kit/groups/index.ts` (export the helper)

- [ ] **Step 4.1: Write failing tests**

`src/canvas-kit/groups/orderedGroups.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { withGroupOrdering } from './orderedGroups';
import type { Group, GroupAdapter } from './types';

interface MiniSceneAdapter {
  rootChildren: string[];
  getChildren(parentId: string | null): string[];
  setChildOrder(parentId: string | null, ids: string[]): void;
}

function makeGroupAdapter(groups: Record<string, Group>): GroupAdapter {
  return {
    getGroup: (id) => groups[id],
    getGroupsForMember: () => [],
    insertGroup: (g) => { groups[g.id] = g; },
    removeGroup: (id) => { delete groups[id]; },
    addToGroup: (gid, ids) => { groups[gid].members.push(...ids); },
    removeFromGroup: (gid, ids) => {
      groups[gid].members = groups[gid].members.filter((m) => !ids.includes(m));
    },
  };
}

describe('withGroupOrdering', () => {
  it('routes getChildren(groupId) to the group\'s members array', () => {
    const groups: Record<string, Group> = { g1: { id: 'g1', members: ['a', 'b', 'c'] } };
    const ga = makeGroupAdapter(groups);
    const scene: MiniSceneAdapter = {
      rootChildren: ['g1'],
      getChildren(parentId) { return parentId === null ? this.rootChildren.slice() : []; },
      setChildOrder(parentId, ids) { if (parentId === null) this.rootChildren = ids.slice(); },
    };
    const wrapped = withGroupOrdering(scene, ga);
    expect(wrapped.getChildren('g1')).toEqual(['a', 'b', 'c']);
    expect(wrapped.getChildren(null)).toEqual(['g1']);
  });

  it('routes setChildOrder(groupId) into the group\'s members', () => {
    const groups: Record<string, Group> = { g1: { id: 'g1', members: ['a', 'b', 'c'] } };
    const ga = makeGroupAdapter(groups);
    const scene: MiniSceneAdapter = {
      rootChildren: ['g1'],
      getChildren() { return []; },
      setChildOrder() {},
    };
    const wrapped = withGroupOrdering(scene, ga);
    wrapped.setChildOrder('g1', ['c', 'a', 'b']);
    expect(groups.g1.members).toEqual(['c', 'a', 'b']);
  });

  it('falls through to the underlying scene adapter for non-group parents', () => {
    const ga = makeGroupAdapter({});
    const scene: MiniSceneAdapter = {
      rootChildren: ['x'],
      getChildren(parentId) { return parentId === null ? this.rootChildren : []; },
      setChildOrder(parentId, ids) { if (parentId === null) this.rootChildren = ids.slice(); },
    };
    const wrapped = withGroupOrdering(scene, ga);
    wrapped.setChildOrder(null, ['x']);
    expect(scene.rootChildren).toEqual(['x']);
  });
});
```

- [ ] **Step 4.2: Run — fail**

```
npm test -- --run src/canvas-kit/groups/orderedGroups.test.ts
```

- [ ] **Step 4.3: Implement**

`src/canvas-kit/groups/orderedGroups.ts`:

```ts
import type { GroupAdapter } from './types';

interface OrderedSceneShape {
  getChildren(parentId: string | null): string[];
  setChildOrder(parentId: string | null, ids: string[]): void;
}

/**
 * Compose a scene adapter's getChildren/setChildOrder with a group adapter
 * so that `parentId === <groupId>` routes to the group's `members[]`. Other
 * parent ids fall through to the scene adapter unchanged.
 *
 * Returns a new object with the routed methods. Use it directly as the
 * `OrderedAdapter` mixin on your full scene adapter:
 *
 *     const ordered = withGroupOrdering(myScene, myGroupAdapter);
 *     myScene.getChildren = ordered.getChildren;
 *     myScene.setChildOrder = ordered.setChildOrder;
 */
export function withGroupOrdering<T extends OrderedSceneShape>(
  scene: T,
  groups: Pick<GroupAdapter, 'getGroup'>,
): OrderedSceneShape {
  return {
    getChildren(parentId) {
      if (parentId !== null) {
        const g = groups.getGroup(parentId);
        if (g) return g.members.slice();
      }
      return scene.getChildren(parentId);
    },
    setChildOrder(parentId, ids) {
      if (parentId !== null) {
        const g = groups.getGroup(parentId);
        if (g) {
          g.members = ids.slice();
          return;
        }
      }
      scene.setChildOrder(parentId, ids);
    },
  };
}
```

- [ ] **Step 4.4: Wire barrel**

In `src/canvas-kit/groups/index.ts`, append:

```ts
export { withGroupOrdering } from './orderedGroups';
```

(If `groups/index.ts` doesn't exist yet, create it with the existing exports plus this one — match what's already barreled in `src/canvas-kit/index.ts`.)

- [ ] **Step 4.5: Run + commit**

```
npm test -- --run src/canvas-kit/groups/orderedGroups.test.ts
npm run build
git add src/canvas-kit/groups/orderedGroups.ts src/canvas-kit/groups/orderedGroups.test.ts src/canvas-kit/groups/index.ts
git commit -m "feat(canvas-kit): route OrderedAdapter through GroupAdapter members[]"
```

---

### Task 5: `useReorderAction` hook

Mirrors `useDeleteAction`. Imperative methods + optional keyboard binding
on `]`, `[`, `Shift+]`, `Shift+[`.

**Files:**
- Create: `src/canvas-kit/interactions/reorder/reorder.ts`
- Create: `src/canvas-kit/interactions/reorder/reorder.test.ts`
- Create: `src/canvas-kit/interactions/reorder/index.ts`

- [ ] **Step 5.1: Write failing tests**

`src/canvas-kit/interactions/reorder/reorder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReorderAction } from './reorder';
import type { Op } from '../../ops/types';

interface FakeAdapter {
  selection: string[];
  parents: Record<string, string | null>;
  children: Record<string, string[]>;
  applied: Array<{ ops: Op[]; label: string }>;
  getSelection(): string[];
  getParent(id: string): string | null;
  getChildren(parentId: string | null): string[];
  setChildOrder(parentId: string | null, ids: string[]): void;
  applyBatch(ops: Op[], label: string): void;
}

function makeAdapter(opts: { selection?: string[]; parents?: Record<string, string | null>; children?: Record<string, string[]> } = {}): FakeAdapter {
  const a: FakeAdapter = {
    selection: opts.selection ?? [],
    parents: opts.parents ?? {},
    children: Object.fromEntries(Object.entries(opts.children ?? {}).map(([k, v]) => [k, v.slice()])),
    applied: [],
    getSelection() { return this.selection.slice(); },
    getParent(id) { return this.parents[id] ?? null; },
    getChildren(parentId) { return (this.children[parentId ?? 'ROOT'] ?? []).slice(); },
    setChildOrder(parentId, ids) { this.children[parentId ?? 'ROOT'] = ids.slice(); },
    applyBatch(ops, label) {
      // In tests, apply each op so ordering is observable.
      this.applied.push({ ops, label });
      for (const op of ops) op.apply(this);
    },
  };
  return a;
}

const mods = (shift = false) =>
  new KeyboardEvent('keydown', { key: shift ? ']' : ']', shiftKey: shift });

describe('useReorderAction', () => {
  it('bringForward applies a single batch with createBringForwardOp', () => {
    const a = makeAdapter({
      selection: ['x'],
      parents: { x: null, y: null },
      children: { ROOT: ['x', 'y'] },
    });
    const { result } = renderHook(() => useReorderAction(a, { enableKeyboard: false }));
    act(() => { result.current.bringForward(); });
    expect(a.applied).toHaveLength(1);
    expect(a.applied[0].label).toBe('Bring forward');
    expect(a.children.ROOT).toEqual(['y', 'x']);
  });

  it('sendBackward / bringToFront / sendToBack each fire one batch with the right label', () => {
    const make = () => makeAdapter({
      selection: ['b'],
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });

    const a1 = make();
    const { result: r1 } = renderHook(() => useReorderAction(a1, { enableKeyboard: false }));
    act(() => { r1.current.sendBackward(); });
    expect(a1.applied[0].label).toBe('Send backward');

    const a2 = make();
    const { result: r2 } = renderHook(() => useReorderAction(a2, { enableKeyboard: false }));
    act(() => { r2.current.bringToFront(); });
    expect(a2.applied[0].label).toBe('Bring to front');
    expect(a2.children.ROOT).toEqual(['a', 'c', 'b']);

    const a3 = make();
    const { result: r3 } = renderHook(() => useReorderAction(a3, { enableKeyboard: false }));
    act(() => { r3.current.sendToBack(); });
    expect(a3.applied[0].label).toBe('Send to back');
    expect(a3.children.ROOT).toEqual(['b', 'a', 'c']);
  });

  it('multi-id selection across parents reorders each parent independently', () => {
    const a = makeAdapter({
      selection: ['a', 'x'],
      parents: { a: null, b: null, x: 'g1', y: 'g1' },
      children: { ROOT: ['a', 'b'], g1: ['x', 'y'] },
    });
    const { result } = renderHook(() => useReorderAction(a, { enableKeyboard: false }));
    act(() => { result.current.bringForward(); });
    expect(a.children.ROOT).toEqual(['b', 'a']);
    expect(a.children.g1).toEqual(['y', 'x']);
  });

  it('empty selection is a no-op', () => {
    const a = makeAdapter({ selection: [], parents: {}, children: { ROOT: [] } });
    const { result } = renderHook(() => useReorderAction(a, { enableKeyboard: false }));
    act(() => { result.current.bringForward(); });
    expect(a.applied).toHaveLength(0);
  });

  it('keyboard: "]" → bringForward, "[" → sendBackward, Shift+"]" → bringToFront, Shift+"[" → sendToBack', () => {
    const a = makeAdapter({
      selection: ['b'],
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    renderHook(() => useReorderAction(a, { enableKeyboard: true }));

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ']' })); });
    expect(a.applied.at(-1)?.label).toBe('Bring forward');

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: '[' })); });
    expect(a.applied.at(-1)?.label).toBe('Send backward');

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ']', shiftKey: true })); });
    expect(a.applied.at(-1)?.label).toBe('Bring to front');

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: '[', shiftKey: true })); });
    expect(a.applied.at(-1)?.label).toBe('Send to back');
  });

  it('keyboard guard: ignores key in input/textarea/contenteditable', () => {
    const a = makeAdapter({
      selection: ['b'],
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    renderHook(() => useReorderAction(a, { enableKeyboard: true }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })); });
    expect(a.applied).toHaveLength(0);
    document.body.removeChild(input);
  });

  it('keyboard guard: ignores when Cmd/Ctrl/Alt held', () => {
    const a = makeAdapter({
      selection: ['b'],
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    renderHook(() => useReorderAction(a, { enableKeyboard: true }));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ']', metaKey: true })); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ']', ctrlKey: true })); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ']', altKey: true })); });
    expect(a.applied).toHaveLength(0);
  });

  it('filter option restricts which selected ids are reordered', () => {
    const a = makeAdapter({
      selection: ['a', 'b'],
      parents: { a: null, b: null, c: null },
      children: { ROOT: ['a', 'b', 'c'] },
    });
    const { result } = renderHook(() =>
      useReorderAction(a, { enableKeyboard: false, filter: (ids) => ids.filter((i) => i !== 'a') }),
    );
    act(() => { result.current.bringForward(); });
    expect(a.children.ROOT).toEqual(['a', 'c', 'b']);
  });

  it('no-ops silently when getChildren/setChildOrder are absent', () => {
    const stub = {
      selection: ['a'],
      getSelection() { return this.selection; },
      getParent: () => null,
      applyBatch: (_ops: Op[]) => {},
      // no getChildren / setChildOrder
    };
    const { result } = renderHook(() => useReorderAction(stub as never, { enableKeyboard: false }));
    expect(() => act(() => { result.current.bringForward(); })).not.toThrow();
  });
});
```

- [ ] **Step 5.2: Run — fail (module not found)**

```
npm test -- --run src/canvas-kit/interactions/reorder/reorder.test.ts
```

- [ ] **Step 5.3: Implement**

`src/canvas-kit/interactions/reorder/reorder.ts`:

```ts
import { useCallback, useEffect, useRef } from 'react';
import {
  createBringForwardOp,
  createSendBackwardOp,
  createBringToFrontOp,
  createSendToBackOp,
} from '../../ops/reorder';
import type { Op } from '../../ops/types';

export interface ReorderAdapter {
  getSelection(): string[];
  getParent(id: string): string | null;
  /** Optional — when absent, every reorder method is a silent no-op. */
  getChildren?(parentId: string | null): string[];
  /** Optional — when absent, every reorder method is a silent no-op. */
  setChildOrder?(parentId: string | null, ids: string[]): void;
  applyBatch(ops: Op[], label: string): void;
}

export interface UseReorderActionOptions {
  /** Auto-bind ], [, Shift+], Shift+[ on document. Default true. */
  enableKeyboard?: boolean;
  /** Optional filter — given selected ids, return the subset to reorder. */
  filter?: (ids: string[]) => string[];
}

export interface UseReorderActionReturn {
  bringForward(): void;
  sendBackward(): void;
  bringToFront(): void;
  sendToBack(): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((target as HTMLElement).isContentEditable) return true;
  if (target.getAttribute('contenteditable') === 'true' || target.getAttribute('contenteditable') === '') return true;
  return false;
}

export function useReorderAction(
  adapter: ReorderAdapter,
  options: UseReorderActionOptions = {},
): UseReorderActionReturn {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const optsRef = useRef(options);
  optsRef.current = options;

  const dispatch = useCallback(
    (factory: (args: { ids: string[] }) => Op, label: string) => {
      const a = adapterRef.current;
      if (!a.getChildren || !a.setChildOrder) return;
      const sel = a.getSelection();
      const ids = optsRef.current.filter ? optsRef.current.filter(sel) : sel;
      if (ids.length === 0) return;
      const op = factory({ ids });
      a.applyBatch([op], label);
    },
    [],
  );

  const bringForward = useCallback(() => dispatch(createBringForwardOp, 'Bring forward'), [dispatch]);
  const sendBackward = useCallback(() => dispatch(createSendBackwardOp, 'Send backward'), [dispatch]);
  const bringToFront = useCallback(() => dispatch(createBringToFrontOp, 'Bring to front'), [dispatch]);
  const sendToBack = useCallback(() => dispatch(createSendToBackOp, 'Send to back'), [dispatch]);

  useEffect(() => {
    const enable = options.enableKeyboard ?? true;
    if (!enable) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === ']' && !e.shiftKey) { e.preventDefault(); bringForward(); return; }
      if (e.key === '[' && !e.shiftKey) { e.preventDefault(); sendBackward(); return; }
      // Shift+] is '}' on US keyboards but e.key === ']' with shiftKey true on most
      // browsers; check both representations to be safe.
      if ((e.key === ']' || e.key === '}') && e.shiftKey) { e.preventDefault(); bringToFront(); return; }
      if ((e.key === '[' || e.key === '{') && e.shiftKey) { e.preventDefault(); sendToBack(); return; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [options.enableKeyboard, bringForward, sendBackward, bringToFront, sendToBack]);

  return { bringForward, sendBackward, bringToFront, sendToBack };
}
```

- [ ] **Step 5.4: Wire local barrel**

`src/canvas-kit/interactions/reorder/index.ts`:

```ts
export { useReorderAction } from './reorder';
export type {
  ReorderAdapter,
  UseReorderActionOptions,
  UseReorderActionReturn,
} from './reorder';
```

- [ ] **Step 5.5: Run + commit**

```
npm test -- --run src/canvas-kit/interactions/reorder/reorder.test.ts
npm run build
git add src/canvas-kit/interactions/reorder/
git commit -m "feat(canvas-kit): add useReorderAction hook with bracket keybindings"
```

---

### Task 6: Public barrel + docs

Export the hook and op factories from the kit's top-level barrel. Document
the array-order convention (top of array = top of stack), the
reverse-iterate hit-test rule, and the forward-iterate render rule in
`concepts.md` and `adapters.md`.

**Files:**
- Modify: `src/canvas-kit/index.ts`
- Modify: `docs/canvas-kit/concepts.md`
- Modify: `docs/canvas-kit/adapters.md`

- [ ] **Step 6.1: Add barrel exports**

In `src/canvas-kit/index.ts`, append:

```ts
export {
  createBringForwardOp,
  createSendBackwardOp,
  createBringToFrontOp,
  createSendToBackOp,
  createMoveToIndexOp,
} from './ops/reorder';
export {
  useReorderAction,
  type ReorderAdapter,
  type UseReorderActionOptions,
  type UseReorderActionReturn,
} from './interactions/reorder';
export type { OrderedAdapter } from './adapters/types';
export { withGroupOrdering } from './groups/orderedGroups';
```

- [ ] **Step 6.2: Document the convention in `concepts.md`**

Append a new section after "Groups (virtual)":

```markdown
## Sibling z-order

Adapters that opt into `OrderedAdapter` expose ordered children:

```ts
interface OrderedAdapter {
  getChildren?(parentId: string | null): string[];
  setChildOrder?(parentId: string | null, ids: string[]): void;
}
```

**Convention:** array order **is** z-order. Index 0 is the bottom, last
index is the top.

- **Hit-test** iterates `getChildren(...)` in **reverse** (top → bottom) so
  the topmost visible object wins.
- **Render layers** iterate **forward** (bottom → top) so the bottom paints
  first and the top paints over it.

The kit doesn't enforce these rules — they're documentation. Every utility
that calls `getChildren` (area-select hit-tests, the future
`renderChildrenLayer` factory) follows them; consumer adapters should too.

For groups, `parentId === <groupId>` routes to the group's `members[]`
array. `withGroupOrdering(scene, groupAdapter)` composes the two so a single
`OrderedAdapter` mixin handles both leaf siblings and group members.

Reorder ops: `createBringForwardOp`, `createSendBackwardOp`,
`createBringToFrontOp`, `createSendToBackOp`, `createMoveToIndexOp`. Each
records before-state per affected parent so undo is exact. Multi-id
selections preserve relative order; cross-parent selections process per
parent.

`useReorderAction` exposes imperative methods and optional keyboard
binding: `]` / `[` for forward / backward; `Shift+]` / `Shift+[` for to-
front / to-back.
```

- [ ] **Step 6.3: Document the adapter shape in `adapters.md`**

Append a new section after `AreaSelectAdapter`:

```markdown
## `OrderedAdapter` (optional mixin)

Opt into sibling z-order by implementing two methods on your scene adapter:

| Method | Purpose |
|---|---|
| `getChildren?(parentId)` | Ordered child ids of `parentId` (or root siblings if null). Index 0 = bottom, last = top. |
| `setChildOrder?(parentId, ids)` | Rewrite the order of `parentId`'s children. Reorder only — no add/remove. |

Both are **optional**. Reorder ops and `useReorderAction` no-op when either
is absent.

**Convention:** hit-tests iterate `getChildren` in REVERSE (top first);
render layers iterate FORWARD (bottom first).

For groups, `parentId === <groupId>` routes to the group's `members[]`.
Use `withGroupOrdering(scene, groupAdapter)` to compose.
```

- [ ] **Step 6.4: Run + commit**

```
npm test -- --run
npm run build
git add src/canvas-kit/index.ts docs/canvas-kit/concepts.md docs/canvas-kit/adapters.md
git commit -m "feat(canvas-kit): export reorder ops + hook; document z-order convention"
```

---

### Task 7: Demo — overlapping rects in ComposeDemo

Surface the keybinds visually. Add three overlapping colored rects to
`ComposeDemo` (or a tiny new section), wire `useReorderAction` against the
demo's existing adapter, and label `]` / `[` / Shift+`]` / Shift+`[` in
the demo's hint text.

**Files:**
- Modify: `src/canvas-kit-demo/demos/ComposeDemo.tsx`

- [ ] **Step 7.1: Extend the demo's adapter with `getChildren` / `setChildOrder`**

In `ComposeDemo.tsx`, the existing rects-state hook becomes the source of
truth for order. Add to the adapter:

```ts
getChildren: (parentId: string | null) =>
  parentId === null ? rectsRef.current.map((r) => r.id) : [],
setChildOrder: (parentId: string | null, ids: string[]) => {
  if (parentId !== null) return;
  setRects((rs) => {
    const byId = new Map(rs.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)!).filter(Boolean);
  });
},
```

(Render iterates `rects` forward; hit-test iterates `getChildren` reversed
so the topmost rect under the cursor wins.)

- [ ] **Step 7.2: Wire the hook**

```tsx
import { useReorderAction } from '@/canvas-kit';

useReorderAction(adapter, { enableKeyboard: true });
```

(No render output needed — the hook only listens to keys.)

- [ ] **Step 7.3: Add three overlapping rects to the demo's initial state**

```ts
const [rects, setRects] = useState<Rect[]>(() => [
  { id: 'r1', x: 80, y: 80, width: 120, height: 120, color: '#ef4444' },
  { id: 'r2', x: 130, y: 130, width: 120, height: 120, color: '#22c55e' },
  { id: 'r3', x: 180, y: 180, width: 120, height: 120, color: '#3b82f6' },
]);
```

(Adjust to match the demo's existing rect shape — including any `color`
field or render path.)

- [ ] **Step 7.4: Update the on-screen hint**

Append to the existing hints overlay:

```
] / [          : bring forward / send backward
Shift+] / [    : bring to front / send to back
```

- [ ] **Step 7.5: Run + commit**

```
npm test -- --run
npm run build
git add src/canvas-kit-demo/demos/ComposeDemo.tsx
git commit -m "feat(canvas-kit-demo): expose sibling z-order keybinds in ComposeDemo"
```

---

### Task 8: Mark TODO done; note `renderChildrenLayer` follow-up

**Files:**
- Modify: `docs/TODO.md`

- [ ] **Step 8.1: Update TODO.md**

Find the line:

```
- **Sibling z-order.** First-class concept of ordering among siblings. ...
```

Replace it with:

```
- ~~**Sibling z-order.**~~ Done (2026-05-01). Array-order via optional
  `OrderedAdapter` (`getChildren` / `setChildOrder`). Five reorder ops
  (`bringForward`, `sendBackward`, `bringToFront`, `sendToBack`,
  `moveToIndex`) and a `useReorderAction` hook with bracket keybindings.
  Group `members[]` routed via `withGroupOrdering`. Convention: array order
  IS z-order, hit-test iterates reversed, render iterates forward.
  - Follow-up: ship a `renderChildrenLayer({ adapter, parentId, draw })`
    factory that iterates `getChildren(parentId)` forward, so consumers
    don't reimplement the convention per layer.
```

- [ ] **Step 8.2: Commit**

```
git add docs/TODO.md
git commit -m "docs(todo): mark sibling z-order done; note renderChildrenLayer follow-up"
```

---

### Task 9: Final verification + push

- [ ] **Step 9.1: Full suite + build**

```
npm test -- --run
npm run build
```

Expected: PASS / clean.

- [ ] **Step 9.2: Push**

```
git push origin main
```

---

## Self-review notes

- **Spec coverage:** Every section in the spec maps to a task — adapter
  contract (Task 1), reorder ops (Tasks 2+3), groups integration (Task 4),
  hook (Task 5), barrel + docs convention (Task 6), demo (Task 7), TODO
  (Task 8).
- **Type names consistent:** `OrderedAdapter`, `ReorderAdapter`,
  `useReorderAction`, `createBringForwardOp` etc. — same names in spec and
  plan, same import paths.
- **Reverse-iterate hit-test:** documented in spec ("Hit-testing
  convention") AND in plan Task 6 (`concepts.md` convention block,
  `adapters.md` convention note).
- **Optional adapter graceful no-op:** chosen over refuse-to-construct
  (justified in spec); enforced in op factories (Task 3) and hook (Task 5)
  with explicit tests for the missing-method case.
- **Multi-parent partitioning:** tested in op factory (Task 3) and hook
  (Task 5) with cross-parent fixtures.

## Open issues

None.
