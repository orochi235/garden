# Garden → SceneCanvas Phase 3: fine-grained scene-op mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `gardenStore`'s wholesale "rebuild the Scene instance" mutation bridge with fine-grained kit Scene ops applied **in place**, so the existing `GardenScene` instance is mutated (never recreated) by every forward mutation.

**Architecture:** A new pure differ `reconcileScene(scene, targetGarden)` runs the existing `gardenToScene(target)` (reusing all parent-local decompose / container-kind / layer / footprint logic), diffs the resulting specs against the live scene, and emits the minimal `add`/`remove`/`setPose`/`update`/`move` ops inside one `scene.batch`. `gardenStore.patch()` is rewritten to split updates into base vs spatial keys: base keys mutate the `base` object; spatial keys call `reconcileScene` against the existing instance. `adoptGarden` (undo/redo/loadGarden/reset) is **unchanged** — instance recreation stays until Phase 4 (`scene.loadState`).

**Tech Stack:** TypeScript, Zustand, weasel kit `Scene` (`@orochi235/weasel`), Vitest, Biome.

---

## Context for the implementer

- This is **seam #2** of the migration spec `docs/superpowers/specs/2026-06-14-garden-scenecanvas-migration-design.md`. Read that spec's "Seam-by-seam sort" row 2 and "Implementation phases" item 3 first.
- The kit Scene mutation API lives in `~/src/weasel/src/core/scene/scene.ts`. Relevant public methods (all mutate in place, all log to the kit's own undo stack, all bump `getVersion()` and notify subscribers):
  - `add(spec)` → adds a node; spec parents must precede children.
  - `remove(id)` → removes the node **and its whole subtree**.
  - `setPose(id, pose)`, `update(id, { data })`, `setLayer(id, layer)`.
  - `move(id, parent, index?)` → reparent; asserts the new parent's layer equals the node's layer (cross-layer move throws).
  - `batch(label, fn)` → groups all ops emitted inside `fn` into **one** undo entry and fires **one** coalesced `notify()`.
  - `get(id)`, `nodes` (a `Map<NodeId, Node>`).
- `gardenToScene(target)` (in `src/scene/gardenConverters.ts`) already produces correctly-ordered specs (structures by zIndex parent-first, then zones, then plantings) with parent-local poses, container/leaf `kind`, derived `layer`, and cultivar-driven footprints. **Reuse it — do not re-derive any of that.**
- `asNodeId(string)` brands a string as a `NodeId`. `String(nodeId)` unbrands. The kit's `scene.nodes` keys are `NodeId`s; `scene.get` takes a `NodeId`.
- There is **no** `deepEqual` util in the repo yet — Task 1 adds one inside `reconcileScene.ts` and exports it for tests.

### Two accepted trade-offs (do NOT try to "fix" these)

1. **Sibling order is not tracked.** Adds and moves append (index defaults to end). Render order is governed by `zIndex` carried in node *data* (readers sort by it), and plantings don't overlap, so insertion order is not semantically meaningful. The converter's own comment confirms tests compare by id, not order.
2. **The kit's internal undo stack accumulates** from these ops but is never read — eric's undo is the snapshot stack (`gardenHistory`). Phase 4's `loadState` clears the kit stack. Leave it.

### Invariants the differ relies on (true for all eric mutations)

- eric **never keeps a child while deleting its parent**: `removeStructure`/`removeZone` delete child plantings in the same update. So any descendant of a target-absent node is also target-absent → boundary subtree removal is safe.
- The only `kind` changes are a structure crossing **leaf↔container** as it gains/loses its first child (a leaf has no surviving descendants to preserve).
- The only `layer` changes are a **planting** (a leaf) crossing structures↔zones on reparent.
- Structures are always on the `structures` layer; zones always on `zones`. Containers never change layer.

---

## File structure

- **Create** `src/scene/reconcileScene.ts` — the differ + `deepEqual` helper. One responsibility: turn a target `Garden` into in-place ops on a live `GardenScene`.
- **Create** `src/scene/reconcileScene.test.ts` — unit tests, one `it` per op category.
- **Modify** `src/store/gardenStore.ts` — rewrite `patch()` to split base/spatial and call `reconcileScene`; add the import. `adoptGarden` and every store method body stay as-is.

---

## Task 1: `reconcileScene` scaffold, `deepEqual`, and the "add" case

**Files:**
- Create: `src/scene/reconcileScene.ts`
- Test: `src/scene/reconcileScene.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/reconcileScene.test.ts`:

```ts
import { asNodeId } from '@orochi235/weasel';
import { describe, expect, it } from 'vitest';
import type { Garden, Planting, Structure, Zone } from '../model/types';
import { createGarden } from '../model/types';
import { gardenToScene, sceneToGarden, splitBase } from './gardenConverters';
import { createGardenScene } from './gardenScene';
import { deepEqual, reconcileScene } from './reconcileScene';

function struct(p: Partial<Structure> & Pick<Structure, 'id'>): Structure {
  return {
    type: 'raised-bed',
    shape: 'rectangle',
    x: 0,
    y: 0,
    width: 4,
    length: 8,
    rotation: 0,
    color: '#aaa',
    label: '',
    zIndex: 0,
    parentId: null,
    groupId: null,
    snapToGrid: true,
    surface: false,
    container: true,
    fill: null,
    layout: null,
    wallThicknessFt: 0.5,
    clipChildren: false,
    ...p,
  };
}
function plant(p: Partial<Planting> & Pick<Planting, 'id' | 'parentId'>): Planting {
  return { cultivarId: 'tomato', x: 1, y: 1, label: '', icon: null, ...p };
}
function zone(p: Partial<Zone> & Pick<Zone, 'id'>): Zone {
  return {
    x: 0,
    y: 0,
    width: 4,
    length: 4,
    color: '#aaa',
    label: '',
    zIndex: 0,
    parentId: null,
    soilType: null,
    sunExposure: null,
    layout: null,
    pattern: null,
    ...p,
  };
}

/** Build a scene from a starting garden, reconcile it to `target`, and return
 *  the round-tripped garden plus the live scene for assertions. */
function reconcileTo(start: Garden, target: Garden) {
  const scene = createGardenScene(gardenToScene(start));
  reconcileScene(scene, target);
  return { scene, out: sceneToGarden(scene, splitBase(target)) };
}

describe('reconcileScene — add', () => {
  it('adds a new structure node that was absent from the scene', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1' })];
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's1' }), struct({ id: 's2', x: 6 })];

    const { scene, out } = reconcileTo(start, target);

    expect(scene.get(asNodeId('s2'))).toBeTruthy();
    expect(out.structures.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(out.structures.find((s) => s.id === 's2')!.x).toBe(6);
  });
});

describe('deepEqual', () => {
  it('treats undefined and absent keys as equal', () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/reconcileScene.test.ts`
Expected: FAIL — `reconcileScene`/`deepEqual` not exported (module does not exist).

- [ ] **Step 3: Write the minimal implementation**

Create `src/scene/reconcileScene.ts`:

```ts
import { asNodeId } from '@orochi235/weasel';
import type { Garden } from '../model/types';
import { gardenToScene } from './gardenConverters';
import type { GardenAddNodeSpec, GardenScene } from './gardenScene';

/**
 * Structural deep-equality that treats `undefined` and absent keys as equal.
 * Used to decide whether a pose/data field actually changed before emitting an
 * op, so an unchanged target produces zero ops.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    const av = ao[k];
    const bv = bo[k];
    if (av === undefined && bv === undefined) continue;
    if (!deepEqual(av, bv)) return false;
  }
  return true;
}

/**
 * Mutate `scene` in place so its nodes match `target` — the Phase-3 replacement
 * for the wholesale "rebuild the instance" bridge. Reuses gardenToScene for all
 * frame/footprint/container/layer logic, then diffs the resulting specs against
 * the live scene and emits the minimal kit ops in a single batch (one undo
 * entry, one coalesced notify).
 */
export function reconcileScene(scene: GardenScene, target: Garden): void {
  const specs = gardenToScene(target);
  const targetIds = new Set(specs.map((s) => String(s.id)));

  scene.batch('reconcile', () => {
    // 3. Adds: specs absent from the scene, in spec order (parent-first).
    const survivors = new Set([...scene.nodes.keys()].map(String));
    for (const s of specs) {
      if (!survivors.has(String(s.id))) scene.add(s);
    }

    // 4. Updates: surviving nodes only. (Pose/data/move filled in later tasks.)
    for (const s of specs) {
      const id = String(s.id);
      if (!survivors.has(id)) continue;
      void id;
    }

    void targetIds;
  });
}

// (`GardenAddNodeSpec` is imported for the typed spec list above.)
void (0 as unknown as GardenAddNodeSpec);
```

Note: the `void targetIds` / `GardenAddNodeSpec` lines are temporary scaffolding so the module type-checks with unused symbols; later tasks consume them and you will delete the `void` lines.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/reconcileScene.test.ts`
Expected: PASS (both `add` and `deepEqual` describes).

- [ ] **Step 5: Commit**

```bash
git add src/scene/reconcileScene.ts src/scene/reconcileScene.test.ts
git commit -m "feat(scene): reconcileScene differ — add case + deepEqual"
```

---

## Task 2: Removals (target-absent boundary subtrees)

**Files:**
- Modify: `src/scene/reconcileScene.ts`
- Test: `src/scene/reconcileScene.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/reconcileScene.test.ts`:

```ts
describe('reconcileScene — remove', () => {
  it('removes a structure and its child plantings as one subtree', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1' }), struct({ id: 's2', x: 6 })];
    start.plantings = [plant({ id: 'p1', parentId: 's1' })];
    // Target deletes s1 (and, as eric always does, its child planting).
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's2', x: 6 })];

    const { scene, out } = reconcileTo(start, target);

    expect(scene.get(asNodeId('s1'))).toBeUndefined();
    expect(scene.get(asNodeId('p1'))).toBeUndefined();
    expect(out.structures.map((s) => s.id)).toEqual(['s2']);
    expect(out.plantings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/reconcileScene.test.ts -t "removes a structure"`
Expected: FAIL — `s1`/`p1` still present (no removal logic yet).

- [ ] **Step 3: Write the implementation**

In `src/scene/reconcileScene.ts`, inside the `scene.batch` callback, add the removal pass **before** the "Adds" block, and delete the `void targetIds;` scaffold line:

```ts
    // 2. Removals: target-absent boundary roots. remove() takes the whole
    //    subtree; guard with get() since a parent removal may already have
    //    deleted descendants. Iterate a snapshot since we mutate.
    for (const [idRaw, node] of [...scene.nodes]) {
      const id = String(idRaw);
      if (targetIds.has(id)) continue;
      const parent = node.parent ? String(node.parent) : null;
      if ((parent === null || targetIds.has(parent)) && scene.get(idRaw)) {
        scene.remove(idRaw);
      }
    }
```

(The `survivors` set in the Adds block must be computed **after** this removal pass — it already is, since Adds follows Removals. Keep that ordering.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/reconcileScene.test.ts`
Expected: PASS (add + remove + deepEqual).

- [ ] **Step 5: Commit**

```bash
git add src/scene/reconcileScene.ts src/scene/reconcileScene.test.ts
git commit -m "feat(scene): reconcileScene — subtree removal of target-absent nodes"
```

---

## Task 3: `setPose` updates (including nested parent-local decompose)

**Files:**
- Modify: `src/scene/reconcileScene.ts`
- Test: `src/scene/reconcileScene.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/reconcileScene.test.ts`:

```ts
describe('reconcileScene — setPose', () => {
  it('moves a top-level structure to new world coords', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1', x: 0, y: 0 })];
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's1', x: 5, y: 3 })];

    const { scene, out } = reconcileTo(start, target);

    expect(scene.get(asNodeId('s1'))!.pose).toMatchObject({ x: 5, y: 3 });
    expect(out.structures[0]).toMatchObject({ x: 5, y: 3 });
  });

  it('keeps a nested structure stored parent-local but round-trips to world', () => {
    const start = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    start.structures = [
      struct({ id: 'parent', x: 10, y: 10, width: 12, length: 12, container: true }),
      struct({ id: 'child', x: 12, y: 12, parentId: 'parent' }),
    ];
    const target = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    target.structures = [
      struct({ id: 'parent', x: 10, y: 10, width: 12, length: 12, container: true }),
      struct({ id: 'child', x: 14, y: 13, parentId: 'parent' }),
    ];

    const { scene, out } = reconcileTo(start, target);

    // Stored pose is parent-local (world 14,13 minus parent origin 10,10).
    expect(scene.get(asNodeId('child'))!.pose).toMatchObject({ x: 4, y: 3 });
    // Round-trips back to world coords for readers.
    expect(out.structures.find((s) => s.id === 'child')).toMatchObject({ x: 14, y: 13 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/reconcileScene.test.ts -t "setPose"`
Expected: FAIL — poses unchanged (no update logic yet).

- [ ] **Step 3: Write the implementation**

In `src/scene/reconcileScene.ts`, replace the placeholder Updates loop body (`void id;`) with the pose update. The full Updates block now reads:

```ts
    // 4. Updates: surviving nodes only (newly added are already correct).
    for (const s of specs) {
      const id = String(s.id);
      if (!survivors.has(id)) continue;
      const node = scene.get(asNodeId(id))!;
      if (!deepEqual(node.pose, s.pose)) scene.setPose(asNodeId(id), s.pose);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/reconcileScene.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/reconcileScene.ts src/scene/reconcileScene.test.ts
git commit -m "feat(scene): reconcileScene — setPose for changed poses (nested-safe)"
```

---

## Task 4: `update` (data) changes

**Files:**
- Modify: `src/scene/reconcileScene.ts`
- Test: `src/scene/reconcileScene.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/reconcileScene.test.ts`:

```ts
describe('reconcileScene — setData', () => {
  it('updates non-spatial fields (color/label) via a data op', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1', color: '#aaa', label: 'old' })];
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's1', color: '#0f0', label: 'new' })];

    const { scene, out } = reconcileTo(start, target);

    const data = scene.get(asNodeId('s1'))!.data as { color: string; label: string };
    expect(data.color).toBe('#0f0');
    expect(data.label).toBe('new');
    expect(out.structures[0]).toMatchObject({ color: '#0f0', label: 'new' });
  });

  it('emits no version bump when target equals the current scene (idempotent)', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1' })];
    start.plantings = [];
    const scene = createGardenScene(gardenToScene(start));
    const before = scene.getVersion();
    reconcileScene(scene, start);
    expect(scene.getVersion()).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/reconcileScene.test.ts -t "setData"`
Expected: FAIL — the color/label test fails (data not updated). The idempotent test already passes (no ops emitted yet for data), which is fine.

- [ ] **Step 3: Write the implementation**

In `src/scene/reconcileScene.ts`, add the data op to the Updates loop, after the `setPose` line:

```ts
      if (!deepEqual(node.data, s.data)) scene.update(asNodeId(id), { data: s.data });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/reconcileScene.test.ts`
Expected: PASS (idempotent test confirms zero version bump on a no-op reconcile).

- [ ] **Step 5: Commit**

```bash
git add src/scene/reconcileScene.ts src/scene/reconcileScene.test.ts
git commit -m "feat(scene): reconcileScene — setData for changed node data; idempotent no-op"
```

---

## Task 5: Same-layer reparent (`move`)

**Files:**
- Modify: `src/scene/reconcileScene.ts`
- Test: `src/scene/reconcileScene.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/reconcileScene.test.ts`:

```ts
describe('reconcileScene — same-layer reparent', () => {
  it('moves a planting from one structure to another (both on structures layer)', () => {
    const start = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    start.structures = [
      struct({ id: 's1', x: 0, y: 0, container: true }),
      struct({ id: 's2', x: 10, y: 0, container: true }),
    ];
    start.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 1 })];
    const target = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    target.structures = [
      struct({ id: 's1', x: 0, y: 0, container: true }),
      struct({ id: 's2', x: 10, y: 0, container: true }),
    ];
    target.plantings = [plant({ id: 'p1', parentId: 's2', x: 2, y: 2 })];

    const { scene, out } = reconcileTo(start, target);

    expect(scene.get(asNodeId('p1'))!.parent).toBe('s2');
    expect(scene.get(asNodeId('p1'))!.pose).toMatchObject({ x: 2, y: 2 });
    expect(out.plantings[0]).toMatchObject({ parentId: 's2', x: 2, y: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/reconcileScene.test.ts -t "same-layer reparent"`
Expected: FAIL — planting still parented to `s1` (no move logic).

- [ ] **Step 3: Write the implementation**

In `src/scene/reconcileScene.ts`, add the move check at the **top** of the Updates loop body, before the `setPose` line, so the full loop body is:

```ts
      const node = scene.get(asNodeId(id))!;
      const curParent = node.parent ? String(node.parent) : null;
      const tgtParent = s.parent ? String(s.parent) : null;
      if (curParent !== tgtParent) {
        scene.move(asNodeId(id), tgtParent ? asNodeId(tgtParent) : null);
      }
      if (!deepEqual(node.pose, s.pose)) scene.setPose(asNodeId(id), s.pose);
      if (!deepEqual(node.data, s.data)) scene.update(asNodeId(id), { data: s.data });
```

(`node` is read once before `move`; `setPose`/`update` re-resolve the node internally, so reading `node.pose`/`node.data` after the in-place move is correct.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/reconcileScene.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/reconcileScene.ts src/scene/reconcileScene.test.ts
git commit -m "feat(scene): reconcileScene — same-layer reparent via move"
```

---

## Task 6: Cross-layer reparent + leaf↔container transition (rebuild roots)

**Files:**
- Modify: `src/scene/reconcileScene.ts`
- Test: `src/scene/reconcileScene.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/reconcileScene.test.ts`:

```ts
describe('reconcileScene — rebuild roots (kind/layer changes)', () => {
  it('reparents a planting across layers (structure → zone) via rebuild', () => {
    const start = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    start.structures = [struct({ id: 's1', x: 0, y: 0, container: true })];
    start.zones = [zone({ id: 'z1', x: 10, y: 0 })];
    start.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 1 })];
    const target = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    target.structures = [struct({ id: 's1', x: 0, y: 0, container: true })];
    target.zones = [zone({ id: 'z1', x: 10, y: 0 })];
    target.plantings = [plant({ id: 'p1', parentId: 'z1', x: 2, y: 2 })];

    const { scene, out } = reconcileTo(start, target);

    const p = scene.get(asNodeId('p1'))!;
    expect(p.parent).toBe('z1');
    expect(p.layer).toBe('zones');
    expect(out.plantings[0]).toMatchObject({ parentId: 'z1', x: 2, y: 2 });
  });

  it('promotes a leaf structure to a container when it gains its first planting', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    // container:false AND no children → emitted as a leaf.
    start.structures = [struct({ id: 's1', container: false })];
    start.plantings = [];
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's1', container: false })];
    target.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 1 })];

    const { scene, out } = reconcileTo(start, target);

    expect(scene.get(asNodeId('s1'))!.kind).toBe('container');
    expect(scene.get(asNodeId('p1'))).toBeTruthy();
    expect(out.plantings.map((p) => p.id)).toEqual(['p1']);
  });

  it('demotes a container structure back to a leaf when its last planting is removed', () => {
    const start = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    start.structures = [struct({ id: 's1', container: false })];
    start.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 1 })];
    const target = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    target.structures = [struct({ id: 's1', container: false })];
    target.plantings = [];

    const { scene, out } = reconcileTo(start, target);

    expect(scene.get(asNodeId('s1'))!.kind).toBe('leaf');
    expect(scene.get(asNodeId('p1'))).toBeUndefined();
    expect(out.plantings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/reconcileScene.test.ts -t "rebuild roots"`
Expected: FAIL — cross-layer `move` throws (subtree-layer assertion) and/or kind never changes.

- [ ] **Step 3: Write the implementation**

In `src/scene/reconcileScene.ts`, add a **rebuild pass as the first step inside `scene.batch`**, before the removal pass:

```ts
    // 1. Rebuild roots: nodes present in both whose kind or layer differs. kit
    //    has no setKind, and cross-layer move/setLayer can't satisfy the
    //    subtree-layer assertion, so remove-subtree + re-add (the re-add happens
    //    in the Adds pass below, since the node is now absent). In eric's data a
    //    rebuild root never has surviving descendants (leaf↔container = no
    //    children; cross-layer = a leaf planting).
    for (const s of specs) {
      const node = scene.get(asNodeId(String(s.id)));
      if (node && (node.kind !== s.kind || node.layer !== s.layer) && scene.get(asNodeId(String(s.id)))) {
        scene.remove(asNodeId(String(s.id)));
      }
    }
```

The removed nodes are absent when `survivors` is computed, so the existing Adds pass re-creates them from specs (parent-first order guarantees their parents exist).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/reconcileScene.test.ts`
Expected: PASS (all three rebuild cases plus every earlier case).

- [ ] **Step 5: Commit**

```bash
git add src/scene/reconcileScene.ts src/scene/reconcileScene.test.ts
git commit -m "feat(scene): reconcileScene — rebuild roots for kind/layer transitions"
```

---

## Task 7: Batch semantics — one reconcile = one history entry; multi-planting rearrange

**Files:**
- Modify: `src/scene/reconcileScene.ts` (cleanup only)
- Test: `src/scene/reconcileScene.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/reconcileScene.test.ts`:

```ts
describe('reconcileScene — batch semantics', () => {
  it('groups a multi-planting rearrange into a single kit history entry', () => {
    const start = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    start.structures = [struct({ id: 's1', x: 0, y: 0, width: 12, length: 12, container: true })];
    start.plantings = [
      plant({ id: 'p1', parentId: 's1', x: 1, y: 1 }),
      plant({ id: 'p2', parentId: 's1', x: 2, y: 2 }),
      plant({ id: 'p3', parentId: 's1', x: 3, y: 3 }),
    ];
    const scene = createGardenScene(gardenToScene(start));
    const entriesBefore = scene.historyEntries().length;

    const target = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    target.structures = [struct({ id: 's1', x: 0, y: 0, width: 12, length: 12, container: true })];
    target.plantings = [
      plant({ id: 'p1', parentId: 's1', x: 4, y: 4 }),
      plant({ id: 'p2', parentId: 's1', x: 5, y: 5 }),
      plant({ id: 'p3', parentId: 's1', x: 6, y: 6 }),
    ];
    reconcileScene(scene, target);

    // Three setPose ops, one batch → exactly one new history entry.
    expect(scene.historyEntries().length).toBe(entriesBefore + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails OR passes**

Run: `npx vitest run src/scene/reconcileScene.test.ts -t "batch semantics"`
Expected: PASS already (the `scene.batch` wrapper has been present since Task 1). This test **locks in** the batch guarantee against regressions. If it fails, the `scene.batch` wrapper was lost — restore it.

- [ ] **Step 3: Remove leftover scaffolding**

Delete any remaining temporary lines from Task 1 in `src/scene/reconcileScene.ts`:
- the trailing `void (0 as unknown as GardenAddNodeSpec);` line, and
- the `// (\`GardenAddNodeSpec\` is imported …)` comment,
- and change the import of `GardenAddNodeSpec` if it is now unused: the final imports should be:

```ts
import { asNodeId } from '@orochi235/weasel';
import type { Garden } from '../model/types';
import { gardenToScene } from './gardenConverters';
import type { GardenScene } from './gardenScene';
```

(Only `GardenScene` is referenced in signatures; `gardenToScene` returns the spec array directly, so `GardenAddNodeSpec` is not needed.)

- [ ] **Step 4: Run the full reconcile suite + typecheck**

Run: `npx vitest run src/scene/reconcileScene.test.ts && npx tsc -b`
Expected: All reconcile tests PASS; `tsc -b` reports only the 4 known `@weasel-js/history` TS2307 dts leaks (no new errors).

- [ ] **Step 5: Commit**

```bash
git add src/scene/reconcileScene.ts src/scene/reconcileScene.test.ts
git commit -m "test(scene): lock reconcileScene batch=one-history-entry; drop scaffold"
```

---

## Task 8: Wire `gardenStore.patch()` to reconcile in place

**Files:**
- Modify: `src/store/gardenStore.ts` (import + `patch` body only)

- [ ] **Step 1: Write the failing test**

Append a new test file `src/store/gardenStore.scene-identity.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useGardenStore } from './gardenStore';

describe('gardenStore — Phase 3 in-place mutation', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
  });

  it('does not lose structure edits and keeps the garden a Scene projection', () => {
    const store = useGardenStore.getState();
    const firstId = store.garden.structures[0].id;
    store.updateStructure(firstId, { color: '#123456' });
    const after = useGardenStore.getState().garden.structures.find((s) => s.id === firstId);
    expect(after!.color).toBe('#123456');
  });

  it('applies a moved structure position through fine-grained ops (applyGardenPatch)', () => {
    const store = useGardenStore.getState();
    const id = store.garden.structures[0].id;
    const moved = store.garden.structures.map((s) =>
      s.id === id ? { ...s, x: s.x + 2 } : s,
    );
    store.applyGardenPatch({ structures: moved });
    const after = useGardenStore.getState().garden.structures.find((s) => s.id === id);
    expect(after!.x).toBe(moved.find((s) => s.id === id)!.x);
  });

  it('base-only updates (name) publish without touching the scene', () => {
    const store = useGardenStore.getState();
    store.updateGarden({ name: 'Renamed' });
    expect(useGardenStore.getState().garden.name).toBe('Renamed');
  });
});
```

- [ ] **Step 2: Run test to verify it (likely) passes via the legacy bridge**

Run: `npx vitest run src/store/gardenStore.scene-identity.test.ts`
Expected: These behaviors already pass through the legacy `adoptGarden` bridge. They are a **safety net** that the rewrite must keep green. Confirm they pass now, then proceed — the rewrite must not break them.

- [ ] **Step 3: Add the import**

In `src/store/gardenStore.ts`, add to the imports near the other `../scene/...` imports (around line 19-21):

```ts
import { reconcileScene } from '../scene/reconcileScene';
```

- [ ] **Step 4: Rewrite `patch()`**

Replace the existing `patch` function (currently):

```ts
  function patch(updates: Partial<Garden>) {
    adoptGarden({ ...composeGarden(), ...updates });
  }
```

with the base/spatial split (keep the surrounding JSDoc comment, update its wording):

```ts
  /**
   * Apply a partial update to the garden via fine-grained, in-place scene ops
   * (Phase 3 — seam #2). Base (non-spatial) keys mutate the `base` object;
   * spatial keys (structures/zones/plantings) are reconciled against the
   * existing Scene instance — the instance is never recreated here. undo/redo/
   * loadGarden/reset still go through adoptGarden until Phase 4 (loadState).
   */
  function patch(updates: Partial<Garden>) {
    const spatialKeys = ['structures', 'zones', 'plantings'];
    const baseUpdates: Record<string, unknown> = {};
    let hasBase = false;
    let hasSpatial = false;
    for (const k of Object.keys(updates)) {
      if (spatialKeys.includes(k)) {
        hasSpatial = true;
      } else {
        baseUpdates[k] = (updates as Record<string, unknown>)[k];
        hasBase = true;
      }
    }
    if (hasBase) {
      base = { ...base, ...baseUpdates } as GardenBase;
      invalidateComposed();
    }
    if (hasSpatial) {
      // Reconcile against the composed target (composeGarden already reflects
      // any base change applied above); reconcile reads only spatial arrays.
      reconcileScene(scene, { ...composeGarden(), ...updates });
    }
    set({ garden: composeGarden() });
  }
```

- [ ] **Step 5: Run the safety-net + full store suites**

Run: `npx vitest run src/store/gardenStore.scene-identity.test.ts src/store/`
Expected: PASS — including the existing gardenStore tests (the parity oracle).

- [ ] **Step 6: Commit**

```bash
git add src/store/gardenStore.ts src/store/gardenStore.scene-identity.test.ts
git commit -m "feat(store): route gardenStore.patch through in-place reconcileScene ops"
```

---

## Task 9: Full gate run

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc -b`
Expected: only the 4 known `@weasel-js/history` TS2307 dts leaks; **no** new errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean (Biome). Fix any `organizeImports`/formatting in the two new files + `gardenStore.ts`.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: all tests pass (≥ the 798 baseline noted in the migration spec; the new reconcile + scene-identity tests add to that count). No regressions in `src/store/` or `src/scene/`.

- [ ] **Step 4: Visual suite**

Run: `npm run test:visual`
Expected: 4/4 pass (no rendering change — `patch` produces the same composed garden, just via in-place ops).

- [ ] **Step 5: Commit any lint fixups**

```bash
git add -A
git commit -m "chore(scene): lint/format fixups for Phase 3 reconcile"
```

(Skip if Step 2 produced no changes.)

---

## Self-review notes (already reconciled against the spec)

- **Seam #2 coverage:** Tasks 1–7 build the fine-grained ops differ; Task 8 routes mutations through it; the existing instance is never recreated by `patch`. ✅
- **Scope boundary:** `adoptGarden` (undo/redo/loadGarden/reset) untouched — Phase 4 owns the `loadState` conversion. ✅
- **No re-derivation:** all frame/footprint/container/layer logic comes from `gardenToScene`; the differ is purely structural. ✅
- **Idempotence:** Task 4's no-op test asserts zero version bump when target == current. ✅
- **Batch:** Task 7 asserts one reconcile = one kit history entry (perf: one coalesced re-render per mutation). ✅
- **Type consistency:** `reconcileScene(scene, target)` and `deepEqual(a, b)` signatures are identical across every task; `GardenBase` is already imported in `gardenStore.ts`. ✅
