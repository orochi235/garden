# Nursery Scene-Backing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the nursery (seed-starting) store scene-authoritative — a live kit `Scene` composed into `garden.nursery` — and mount `NurseryCanvas` on `<SceneCanvas>` (keeping eric's own seed tools), so eric compiles against weasel HEAD where bare `<Canvas>` is internal.

**Architecture:** Mirror garden Phases 1-6 (`src/scene/gardenScene.ts`, `gardenConverters.ts`, `reconcileScene.ts`, the `gardenStore` scene seam) for the nursery, with one deliberate divergence: nursery positions are *derived* (trays auto-flow from array order; seedlings are cell-indexed by `(trayId,row,col)`), so scene poses are projections of authoritative cell/index data — and undo/persistence stay array-based (lossless) rather than `SerializedScene`. The nursery gets its own `NurseryScene` instance alongside the garden scene; the kit gesture dispatcher is NOT adopted (eric's seed tools keep gestures via the `tools`-takeover form, `enableGestureDispatcher={false}`).

**Tech Stack:** TypeScript, React, Zustand, `@orochi235/weasel` (kit Scene + SceneCanvas), Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-06-20-nursery-scene-backing-design.md`

**Precedent to mirror (read these first):**
- `src/scene/gardenScene.ts` — types + `createGardenScene`
- `src/scene/gardenConverters.ts` — `gardenToScene` / `sceneToGarden` / `splitBase`
- `src/scene/reconcileScene.ts` — the in-place differ + `deepEqual`
- `src/store/gardenStore.ts:244-503` — the scene seam (compose/subscribe/patch/adopt/bootstrap)
- `src/canvas/GardenCanvas.tsx:675-783` — the `<SceneCanvas>` mount
- `src/model/nursery.ts` — `Tray`, `Seedling`, `NurseryState`, `getCell`, cell math
- `src/canvas/nurseryHitTest.ts` — `cellCenterInches`, `hitTestCellInches`
- `src/canvas/adapters/nurseryScene.ts` — `trayWorldOrigin`, existing `NurserySceneAdapter`

---

## File structure

| File | Responsibility | New/Modified |
|---|---|---|
| `src/scene/nurseryScene.ts` | Types (`NurseryScene`, `NurseryPose`, `NurseryNodeData`, `NurseryLayer`, `NurseryBase`), `createNurseryScene`, `nurseryToScene`, `sceneToNursery`, `splitNurseryBase` | Create |
| `src/scene/nurseryScene.test.ts` | Round-trip + converter unit tests | Create |
| `src/scene/reconcileNurseryScene.ts` | `reconcileNurseryScene(scene, target)` in-place differ | Create |
| `src/scene/reconcileNurseryScene.test.ts` | Differ unit tests | Create |
| `src/scene/gardenScene.ts` | `GardenBase` drops `nursery` | Modify |
| `src/scene/gardenConverters.ts` | `splitBase` drops `nursery`; `sceneToGarden` returns `Omit<Garden,'nursery'>` | Modify |
| `src/store/gardenStore.ts` | Nursery scene seam: module vars, `composeNursery`, subscribe, `getNurseryScene`, `patch` routing, bootstrap, `adoptGarden` | Modify |
| `src/utils/file.ts` | Re-add `nursery` arrays to `serializeGarden`; split nursery out in `deserializeGarden` | Modify |
| `src/canvas/NurseryCanvas.tsx` | Mount on `<SceneCanvas>` via `getNurseryScene`, `tools` takeover, dispatcher off | Modify |

---

## Data model mapping (the crux)

- **Tray → `container` node** (always container, even empty), layer `'trays'`.
  - Pose = `{ x, y, width: tray.widthIn, height: tray.heightIn }` where `(x,y) = trayWorldOrigin(tray, ns)`.
  - `data = { kind: 'tray', order: <index in ns.trays>, tray }`. The `order` field is the nursery analog of garden's `zIndex` — it preserves auto-flow order across reconcile (the scene does not reorder existing nodes, so order must be carried in data and sorted on compose).
- **In-tray seedling → `leaf` node**, layer `'seedlings'`, `parent = trayId`.
  - **Local** pose = `{ x, y, width: tray.cellPitchIn, height: tray.cellPitchIn }` where `(x,y) = cellCenterInches(tray, row, col)`.
  - `data = { kind: 'seedling', seedling }`.
- **Transplanted-out seedling** (`trayId == null`): excluded from the scene; lives in `NurseryBase.transplanted: Seedling[]`.

`sceneToNursery` reads authority straight from `data` (not poses): trays sorted by `order`, seedlings from seedling-node data, then `base.transplanted` appended.

---

## Task 1: Nursery scene types + converters

**Files:**
- Create: `src/scene/nurseryScene.ts`
- Test: `src/scene/nurseryScene.test.ts`

- [ ] **Step 1: Write `nurseryScene.ts` types + `createNurseryScene`**

```ts
import type { AddNodeSpec, Scene } from '@orochi235/weasel';
import { asNodeId, createScene } from '@orochi235/weasel';
import type { NurseryState, Seedling, Tray } from '../model/nursery';
import { cellCenterInches } from '../canvas/nurseryHitTest';
import { trayWorldOrigin } from '../canvas/adapters/nurseryScene';

export type NurseryLayer = 'trays' | 'seedlings';

/** Render order, low→high: tray bodies under seedlings. */
export const NURSERY_LAYERS: readonly NurseryLayer[] = ['trays', 'seedlings'];

/** Matches GARDEN_HISTORY_LIMIT. */
export const NURSERY_HISTORY_LIMIT = 100;

/** Translation + size. Trays carry outer dims; seedlings carry cell pitch.
 *  Tray poses are world (auto-flow origin); seedling poses are parent-LOCAL
 *  (cell center within the tray). Both are PROJECTIONS of authoritative
 *  cell/index data, recomputed every reconcile — never the source of truth. */
export interface NurseryPose {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type NurseryNodeData =
  | { kind: 'tray'; order: number; tray: Tray }
  | { kind: 'seedling'; seedling: Seedling };

export type NurseryScene = Scene<NurseryNodeData, NurseryLayer, NurseryPose>;
export type NurseryAddNodeSpec = AddNodeSpec<NurseryNodeData, NurseryLayer, NurseryPose>;

/** The non-spatial remainder of a NurseryState — seedlings the scene does NOT
 *  own (transplanted-out: trayId/row/col all null, history-only, not rendered). */
export interface NurseryBase {
  transplanted: Seedling[];
}

export function createNurseryScene(initial: readonly NurseryAddNodeSpec[]): NurseryScene {
  return createScene<NurseryNodeData, NurseryLayer, NurseryPose>({
    systemLayers: NURSERY_LAYERS.map((id) => ({ id })),
    initial,
    historyLimit: NURSERY_HISTORY_LIMIT,
  });
}
```

- [ ] **Step 2: Add `nurseryToScene`, `splitNurseryBase`, `sceneToNursery` to `nurseryScene.ts`**

```ts
/** A seedling lives in the scene iff it occupies a tray cell. */
function isInTray(s: Seedling): boolean {
  return s.trayId != null && s.row != null && s.col != null;
}

export function nurseryToScene(ns: NurseryState): NurseryAddNodeSpec[] {
  const specs: NurseryAddNodeSpec[] = [];
  const trayById = new Map(ns.trays.map((t) => [t.id, t]));

  // Trays (containers) — emitted in array order; `order` carries that order so
  // it survives reconcile (which never reorders existing nodes).
  ns.trays.forEach((tray, order) => {
    const o = trayWorldOrigin(tray, ns);
    specs.push({
      id: asNodeId(tray.id),
      kind: 'container',
      layer: 'trays',
      pose: { x: o.x, y: o.y, width: tray.widthIn, height: tray.heightIn },
      parent: null,
      data: { kind: 'tray', order, tray },
    });
  });

  // In-tray seedlings (leaves) — child of their tray, parent-LOCAL cell-center
  // pose. Transplanted-out seedlings are excluded (they go to NurseryBase).
  for (const s of ns.seedlings) {
    if (!isInTray(s)) continue;
    const tray = trayById.get(s.trayId as string);
    if (!tray) continue; // dangling trayId — drop from scene, kept by base? No: it's lost; guard upstream.
    const c = cellCenterInches(tray, s.row as number, s.col as number);
    specs.push({
      id: asNodeId(s.id),
      kind: 'leaf',
      layer: 'seedlings',
      pose: { x: c.x, y: c.y, width: tray.cellPitchIn, height: tray.cellPitchIn },
      parent: asNodeId(s.trayId as string),
      data: { kind: 'seedling', seedling: s },
    });
  }

  return specs;
}

/** Split a NurseryState into the scene-bound part (returned by sceneToNursery)
 *  and the non-spatial base (transplanted-out seedlings). */
export function splitNurseryBase(ns: NurseryState): NurseryBase {
  return { transplanted: ns.seedlings.filter((s) => !isInTray(s)) };
}

/** Compose a NurseryState from a live scene + base. Trays sorted by `order`;
 *  seedlings = in-tray (from scene) + transplanted-out (from base). Authority
 *  is read from node `data`, not poses (poses are derived projections). */
export function sceneToNursery(scene: NurseryScene, base: NurseryBase): NurseryState {
  const trays: { order: number; tray: Tray }[] = [];
  const seedlings: Seedling[] = [];
  for (const [, node] of scene.nodes) {
    if (node.data.kind === 'tray') trays.push({ order: node.data.order, tray: node.data.tray });
    else seedlings.push(node.data.seedling);
  }
  trays.sort((a, b) => a.order - b.order);
  return {
    trays: trays.map((t) => t.tray),
    seedlings: [...seedlings, ...base.transplanted],
  };
}
```

(Note the `dangling trayId` comment: an in-tray seedling whose `trayId` is not in `ns.trays` is malformed; today's model never produces it — `removeTray` deletes the tray's seedlings. The guard drops it defensively. If this ever fires in tests, fix the upstream writer.)

- [ ] **Step 3: Write round-trip + converter tests**

```ts
// src/scene/nurseryScene.test.ts
import { describe, expect, it } from 'vitest';
import { createTray, createSeedling, type NurseryState } from '../model/nursery';
import { setCell } from '../model/nursery';
import {
  createNurseryScene,
  nurseryToScene,
  sceneToNursery,
  splitNurseryBase,
} from './nurseryScene';

function sown(ns: NurseryState, trayIdx: number, row: number, col: number, cultivarId: string) {
  const tray = ns.trays[trayIdx];
  const s = createSeedling({ cultivarId, trayId: tray.id, row, col });
  ns.trays[trayIdx] = setCell(tray, row, col, { state: 'sown', seedlingId: s.id });
  ns.seedlings.push(s);
}

function fixture(): NurseryState {
  const ns: NurseryState = {
    trays: [
      createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 'A' }),
      createTray({ rows: 3, cols: 3, cellSize: 'small', label: 'B' }),
    ],
    seedlings: [],
  };
  sown(ns, 0, 0, 0, 'tomato');
  sown(ns, 0, 1, 1, 'basil');
  sown(ns, 1, 2, 0, 'pepper');
  // one transplanted-out (history only)
  ns.seedlings.push(createSeedling({ cultivarId: 'kale', trayId: null, row: null, col: null }));
  return ns;
}

describe('nurseryToScene + sceneToNursery round-trip', () => {
  it('preserves trays (in order), in-tray seedlings, and transplanted-out via base', () => {
    const ns = fixture();
    const scene = createNurseryScene(nurseryToScene(ns));
    const base = splitNurseryBase(ns);
    const out = sceneToNursery(scene, base);

    expect(out.trays.map((t) => t.label)).toEqual(['A', 'B']);
    expect(out.trays).toEqual(ns.trays);

    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect([...out.seedlings].sort(byId)).toEqual([...ns.seedlings].sort(byId));
    // transplanted-out seedling came back via base
    expect(out.seedlings.some((s) => s.cultivarId === 'kale' && s.trayId === null)).toBe(true);
  });

  it('excludes transplanted-out seedlings from the scene nodes', () => {
    const ns = fixture();
    const scene = createNurseryScene(nurseryToScene(ns));
    const seedlingNodes = [...scene.nodes].filter(([, n]) => n.data.kind === 'seedling');
    expect(seedlingNodes).toHaveLength(3); // the 3 in-tray, not the kale
  });

  it('emits a seedling as a leaf child of its tray with a parent-local cell pose', () => {
    const ns = fixture();
    const specs = nurseryToScene(ns);
    const seedlingSpec = specs.find((s) => s.data.kind === 'seedling')!;
    expect(seedlingSpec.kind).toBe('leaf');
    expect(seedlingSpec.layer).toBe('seedlings');
    expect(String(seedlingSpec.parent)).toBe(ns.trays[0].id);
    expect(seedlingSpec.pose.x).toBeGreaterThan(0); // cell-center local offset
  });

  it('splitNurseryBase returns only transplanted-out seedlings', () => {
    const ns = fixture();
    expect(splitNurseryBase(ns).transplanted).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/scene/nurseryScene.test.ts`
Expected: PASS (4 tests). If `out.trays` deep-equal fails, check that `createTray` produces deterministic ids — it uses `generateId()`, so build `ns` once and reuse (the test does).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.app.json` → no new errors (the `NurseryCanvas` `Canvas` error remains until Task 5).

```bash
git add src/scene/nurseryScene.ts src/scene/nurseryScene.test.ts
git commit -m "feat(nursery): scene converters — nurseryToScene/sceneToNursery + base split"
```

---

## Task 2: reconcileNurseryScene (in-place differ)

**Files:**
- Create: `src/scene/reconcileNurseryScene.ts`
- Test: `src/scene/reconcileNurseryScene.test.ts`

Mirror `src/scene/reconcileScene.ts` exactly (rebuild changed kind/layer, remove target-absent, add new parent-first, update survivors), reusing its exported `deepEqual`.

- [ ] **Step 1: Write `reconcileNurseryScene.ts`**

```ts
import type { NurseryState } from '../model/nursery';
import { nurseryToScene } from './nurseryScene';
import type { NurseryScene } from './nurseryScene';
import { deepEqual } from './reconcileScene';

/**
 * Mutate `scene` in place so its nodes match `target` (the nursery analog of
 * reconcileScene). Reuses nurseryToScene for all pose/order/parent logic, then
 * diffs against the live scene and emits minimal kit ops in one batch (one undo
 * entry, one coalesced notify). The scene instance is never recreated, so a
 * mounted <SceneCanvas> keeps its ref.
 */
export function reconcileNurseryScene(scene: NurseryScene, target: NurseryState): void {
  const specs = nurseryToScene(target);
  const targetIds = new Set(specs.map((s) => String(s.id)));

  scene.batch('reconcile-nursery', () => {
    // 1. Rebuild roots: present in both but kind/layer differs (no setKind).
    for (const s of specs) {
      const node = scene.get(s.id!);
      if (node && (node.kind !== s.kind || node.layer !== s.layer)) scene.remove(s.id!);
    }
    // 2. Removals: target-absent boundary roots (subtree-safe, snapshot iterate).
    for (const [idRaw, node] of [...scene.nodes]) {
      const id = String(idRaw);
      if (targetIds.has(id)) continue;
      const parent = node.parent ? String(node.parent) : null;
      if ((parent === null || targetIds.has(parent)) && scene.get(idRaw)) scene.remove(idRaw);
    }
    // 3. Adds: specs absent after removals, in spec order (parent-first).
    const survivors = new Set([...scene.nodes.keys()].map(String));
    for (const s of specs) {
      if (!survivors.has(String(s.id))) scene.add(s);
    }
    // 4. Updates: surviving nodes only.
    for (const s of specs) {
      if (!survivors.has(String(s.id))) continue;
      const node = scene.get(s.id!)!;
      const curParent = node.parent ? String(node.parent) : null;
      const tgtParent = s.parent ? String(s.parent) : null;
      if (curParent !== tgtParent) scene.move(s.id!, s.parent ?? null);
      if (!deepEqual(node.pose, s.pose)) scene.setPose(s.id!, s.pose);
      if (!deepEqual(node.data, s.data)) scene.update(s.id!, { data: s.data });
    }
  });
}
```

- [ ] **Step 2: Write differ tests**

```ts
// src/scene/reconcileNurseryScene.test.ts
import { describe, expect, it } from 'vitest';
import { createTray, createSeedling, setCell, type NurseryState } from '../model/nursery';
import { createNurseryScene, nurseryToScene } from './nurseryScene';
import { reconcileNurseryScene } from './reconcileNurseryScene';

function withTray(label: string): NurseryState {
  return { trays: [createTray({ rows: 2, cols: 2, cellSize: 'medium', label })], seedlings: [] };
}

describe('reconcileNurseryScene', () => {
  it('adds a newly-sown seedling as a child node', () => {
    const ns = withTray('A');
    const scene = createNurseryScene(nurseryToScene(ns));
    expect([...scene.nodes].filter(([, n]) => n.data.kind === 'seedling')).toHaveLength(0);

    const s = createSeedling({ cultivarId: 'tomato', trayId: ns.trays[0].id, row: 0, col: 0 });
    const next: NurseryState = {
      trays: [setCell(ns.trays[0], 0, 0, { state: 'sown', seedlingId: s.id })],
      seedlings: [s],
    };
    reconcileNurseryScene(scene, next);

    const node = scene.get(s.id as never);
    expect(node).toBeDefined();
    expect(String(node!.parent)).toBe(ns.trays[0].id);
  });

  it('removes a seedling node when the cell is cleared', () => {
    const s = createSeedling({ cultivarId: 'tomato', trayId: undefined, row: 0, col: 0 });
    const tray = createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 'A' });
    const seeded: NurseryState = {
      trays: [setCell({ ...tray }, 0, 0, { state: 'sown', seedlingId: s.id })],
      seedlings: [{ ...s, trayId: tray.id }],
    };
    const scene = createNurseryScene(nurseryToScene(seeded));
    expect(scene.get(s.id as never)).toBeDefined();

    const cleared: NurseryState = { trays: [tray], seedlings: [] };
    reconcileNurseryScene(scene, cleared);
    expect(scene.get(s.id as never)).toBeUndefined();
  });

  it('updates tray order in node data on reorder (no add/remove)', () => {
    const a = createTray({ rows: 1, cols: 1, cellSize: 'medium', label: 'A' });
    const b = createTray({ rows: 1, cols: 1, cellSize: 'medium', label: 'B' });
    const ns: NurseryState = { trays: [a, b], seedlings: [] };
    const scene = createNurseryScene(nurseryToScene(ns));

    reconcileNurseryScene(scene, { trays: [b, a], seedlings: [] });
    const nodeA = scene.get(a.id as never)!;
    const nodeB = scene.get(b.id as never)!;
    expect((nodeA.data as { order: number }).order).toBe(1);
    expect((nodeB.data as { order: number }).order).toBe(0);
  });

  it('a no-op reconcile emits no version bump', () => {
    const ns = withTray('A');
    const scene = createNurseryScene(nurseryToScene(ns));
    const v = scene.getVersion();
    reconcileNurseryScene(scene, ns);
    expect(scene.getVersion()).toBe(v);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/scene/reconcileNurseryScene.test.ts`
Expected: PASS (4 tests). If the no-op test fails (version bumped), confirm `deepEqual` is comparing `data` correctly — the `tray` objects must be reference-stable or structurally equal between passes (they are, since `nurseryToScene` puts the same `tray` object in `data`).

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.app.json` → no new errors.

```bash
git add src/scene/reconcileNurseryScene.ts src/scene/reconcileNurseryScene.test.ts
git commit -m "feat(nursery): reconcileNurseryScene in-place differ"
```

---

## Task 3: gardenStore nursery scene seam

This is the invasive task: `nursery` leaves `GardenBase` and becomes scene-backed. Land it as ONE commit because the type change ripples across `gardenScene.ts`, `gardenConverters.ts`, `gardenStore.ts`, and `file.ts` and cannot be split without a red `tsc`.

**Files:**
- Modify: `src/scene/gardenScene.ts` (GardenBase)
- Modify: `src/scene/gardenConverters.ts` (`splitBase`, `sceneToGarden` return type)
- Modify: `src/store/gardenStore.ts` (the seam)
- Modify: `src/utils/file.ts` (`deserializeGarden` nursery split)
- Test: `src/store/gardenSceneFacade.test.ts` (existing — must stay green) + new nursery seam test

- [ ] **Step 1: `GardenBase` drops `nursery`**

In `src/scene/gardenScene.ts`, line 86:

```ts
/** The non-spatial remainder of a Garden — everything the Scene does NOT own.
 *  `nursery` is excluded: it is backed by its own NurseryScene (see
 *  src/scene/nurseryScene.ts), composed into `garden.nursery` separately. */
export type GardenBase = Omit<Garden, 'structures' | 'zones' | 'plantings' | 'nursery'>;
```

- [ ] **Step 2: `splitBase` + `sceneToGarden` drop nursery**

In `src/scene/gardenConverters.ts`:

`splitBase` (line 178):

```ts
export function splitBase(garden: Garden): GardenBase {
  const { structures: _s, zones: _z, plantings: _p, nursery: _n, ...base } = garden;
  return base;
}
```

`sceneToGarden` return type (line 184) — change the signature and the final return so it produces everything EXCEPT nursery (the store/file callers add nursery):

```ts
export function sceneToGarden(scene: GardenScene, base: GardenBase): Omit<Garden, 'nursery'> {
```

The final `return { ...base, structures, zones, plantings };` (line 265) is unchanged in body — it now structurally matches `Omit<Garden,'nursery'>`.

- [ ] **Step 3: Add the nursery seam to `gardenStore.ts`**

Add imports (top of file, near the existing scene imports):

```ts
import {
  createNurseryScene,
  nurseryToScene,
  sceneToNursery,
  splitNurseryBase,
  type NurseryBase,
  type NurseryScene,
} from '../scene/nurseryScene';
import { reconcileNurseryScene } from '../scene/reconcileNurseryScene';
```

Add module-scoped state next to `let scene` / `let base` (around line 268-277):

```ts
let nurseryScene: NurseryScene = createNurseryScene([]);
let nurseryBase: NurseryBase = { transplanted: [] };

let composedNursery: NurseryState | null = null;
let composedNurseryVersion = -1;
let composedNurseryBase: NurseryBase | null = null;
```

Add `composeNursery` + invalidation next to `composeGarden` (around line 285-301):

```ts
function composeNursery(): NurseryState {
  const v = nurseryScene.getVersion();
  if (composedNursery && composedNurseryVersion === v && composedNurseryBase === nurseryBase)
    return composedNursery;
  composedNursery = sceneToNursery(nurseryScene, nurseryBase);
  composedNurseryVersion = v;
  composedNurseryBase = nurseryBase;
  return composedNursery;
}

function invalidateComposedNursery() {
  composedNursery = null;
  composedNurseryVersion = -1;
  composedNurseryBase = null;
}
```

Change `composeGarden` (line 289) to inject nursery:

```ts
function composeGarden(): Garden {
  const v = scene.getVersion();
  if (
    composed &&
    composedVersion === v &&
    composedBase === base &&
    composedNurseryRef === composeNursery() &&
    !overridesDirty
  )
    return composed;
  composed = { ...applyOverrides(sceneToGarden(scene, base)), nursery: composeNursery() };
  composedVersion = v;
  composedBase = base;
  composedNurseryRef = composed.nursery;
  overridesDirty = false;
  return composed;
}
```

Add `let composedNurseryRef: NurseryState | null = null;` next to the other compose memo vars, and reset it in `invalidateComposed()`:

```ts
function invalidateComposed() {
  composed = null;
  composedVersion = -1;
  composedBase = null;
  composedNurseryRef = null;
}
```

(The `composedNurseryRef` check makes the garden facade recompute when the nursery changes, since `garden.nursery` is part of the returned object. `composeNursery()` is memoized, so calling it in the guard is cheap.)

- [ ] **Step 4: route nursery through the nursery scene in `patch` + subscribe + adopt + bootstrap**

`subscribeScene` (line 305) — also subscribe the nursery scene:

```ts
function subscribeScene() {
  scene.subscribe(() => set({ garden: composeGarden() }));
  nurseryScene.subscribe(() => set({ garden: composeGarden() }));
}
```

`patch` (line 349) — treat `nursery` as a third channel (not base, not garden-spatial):

```ts
function patch(updates: Partial<Garden>) {
  const baseUpdates: Record<string, unknown> = {};
  let hasBase = false;
  let hasSpatial = false;
  let hasNursery = false;
  for (const k of Object.keys(updates)) {
    if ((SPATIAL_KEYS as readonly string[]).includes(k)) {
      hasSpatial = true;
    } else if (k === 'nursery') {
      hasNursery = true;
    } else {
      baseUpdates[k] = (updates as Record<string, unknown>)[k];
      hasBase = true;
    }
  }
  if (hasBase) {
    base = { ...base, ...baseUpdates } as GardenBase;
    invalidateComposed();
  }
  if (hasNursery) {
    const next = updates.nursery as NurseryState;
    nurseryBase = splitNurseryBase(next);
    invalidateComposedNursery();
    invalidateComposed(); // garden facade embeds nursery
    reconcileNurseryScene(nurseryScene, next);
  }
  if (hasSpatial) {
    reconcileScene(scene, { ...composeGarden(), ...updates });
  }
  set({ garden: composeGarden() });
}
```

`adoptGarden` (line 317) — also rebuild the nursery scene/base in place:

```ts
function adoptGarden(next: Garden) {
  base = splitBase(next);
  nurseryBase = splitNurseryBase(next.nursery);
  scene.loadState(gardenToSerializedScene(next));
  reconcileNurseryScene(nurseryScene, next.nursery);
  invalidateComposed();
  invalidateComposedNursery();
  set({ garden: composeGarden() });
}
```

(Using `reconcileNurseryScene` rather than recreating keeps the `nurseryScene` instance identity stable, so a mounted `NurseryCanvas` keeps its captured ref across loadGarden/reset/undo-restore.)

`restoreSnapshot` (line 335) — nursery is no longer in `snap.base`, so drop the `nursery: base.nursery` overlay (garden undo already cannot touch nursery now that it's not in base):

```ts
function restoreSnapshot(snap: GardenSnapshot) {
  base = snap.base;
  invalidateComposed();
  scene.loadState(snap.scene);
  set({ garden: composeGarden() });
}
```

Bootstrap (line 474-478) — build the nursery scene from the initial garden:

```ts
const bootstrap = initialGarden();
base = splitBase(bootstrap);
nurseryBase = splitNurseryBase(bootstrap.nursery);
scene = createGardenScene(gardenToScene(bootstrap));
nurseryScene = createNurseryScene(nurseryToScene(bootstrap.nursery));
subscribeScene();
invalidateComposed();
invalidateComposedNursery();
```

Add the public accessor in the returned store object (next to `getScene`, line 483):

```ts
getNurseryScene: () => nurseryScene,
```

And declare it in the `GardenStore` interface (next to `getScene: () => GardenScene;`, around line 48):

```ts
getNurseryScene: () => NurseryScene;
```

(`commitNursery` at line 380 is UNCHANGED — it still pushes `get().garden.nursery` array snapshots to `nurseryHistory`, then calls `patch({ nursery })`, which now routes through the nursery scene. Undo stays array-based per the approved simplification; restore calls `patch` → `reconcileNurseryScene` in place.)

- [ ] **Step 5: `deserializeGarden` — split nursery out of base**

In `src/utils/file.ts`, the new-format branch (line 93-98) currently spreads `data.nursery` into `base`. Since `GardenBase` no longer includes nursery, pull it out explicitly and re-attach:

```ts
if (data.scene != null) {
  const { scene: serialized, nursery, ...base } = data;
  const scene = createGardenScene([]);
  scene.loadState(serialized as GardenSerializedScene);
  return { ...sceneToGarden(scene, base as GardenBase), nursery };
}
```

(`data.nursery` is guaranteed set by line 85's `if (!data.nursery) data.nursery = emptyNurseryState();`. The legacy array-format branch at line 100-103 already returns `data as Garden` with nursery intact.)

- [ ] **Step 6: Write a nursery-seam store test**

```ts
// add to src/store/gardenSceneFacade.test.ts (or a new src/store/nurserySceneFacade.test.ts)
import { describe, expect, it, beforeEach } from 'vitest';
import { useGardenStore } from './gardenStore';
import { createTray } from '../model/nursery';

describe('nursery scene-backed facade', () => {
  beforeEach(() => useGardenStore.getState().reset());

  it('getNurseryScene returns a stable instance across nursery edits', () => {
    const s1 = useGardenStore.getState().getNurseryScene();
    useGardenStore.getState().addTray(createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 'A' }));
    const s2 = useGardenStore.getState().getNurseryScene();
    expect(s2).toBe(s1);
  });

  it('addTray surfaces through garden.nursery (composed from the scene)', () => {
    useGardenStore.getState().addTray(createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 'A' }));
    const trays = useGardenStore.getState().garden.nursery.trays;
    expect(trays.map((t) => t.label)).toContain('A');
  });

  it('nursery undo restores prior state and does not touch garden', () => {
    const store = useGardenStore.getState();
    const beforeStructures = store.garden.structures.length;
    store.addTray(createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 'A' }));
    expect(useGardenStore.getState().garden.nursery.trays).toHaveLength(1);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.nursery.trays).toHaveLength(0);
    expect(useGardenStore.getState().garden.structures.length).toBe(beforeStructures);
  });

  it('reorderTrays reflows tray order through the scene', () => {
    const store = useGardenStore.getState();
    store.addTray(createTray({ rows: 1, cols: 1, cellSize: 'medium', label: 'A' }));
    store.addTray(createTray({ rows: 1, cols: 1, cellSize: 'medium', label: 'B' }));
    useGardenStore.getState().reorderTrays(0, 1);
    expect(useGardenStore.getState().garden.nursery.trays.map((t) => t.label)).toEqual(['B', 'A']);
  });
});
```

- [ ] **Step 7: Run the affected suites**

Run: `npx vitest run src/store src/scene`
Expected: PASS — the new nursery-seam tests AND all existing garden facade/converter/reconcile tests (garden mode must be unaffected). Watch especially `gardenSceneFacade.test.ts` and `gardenConverters.test.ts`.

- [ ] **Step 8: Run the full nursery action + tool suites**

Run: `npx vitest run src/store/gardenStore.test.ts src/canvas/tools`
Expected: PASS — every existing nursery action test (`addTray`/`removeTray`/`renameTray`/`reorderTrays`/`sowCell`/`moveSeedling`/`moveSeedlingGroup`/`moveSeedlingsAcrossTrays`/`fillTray`) and seed-tool test passes unchanged. The facade shape (`garden.nursery = { trays, seedlings }`) is preserved, so behavior is identical.

- [ ] **Step 9: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.app.json` → only the `NurseryCanvas` `Canvas` error remains.

```bash
git add src/scene/gardenScene.ts src/scene/gardenConverters.ts src/store/gardenStore.ts src/utils/file.ts src/store/gardenSceneFacade.test.ts
git commit -m "feat(nursery): scene-back the nursery store (compose from NurseryScene, leaves GardenBase)"
```

---

## Task 4: Persistence — keep nursery arrays after base removal

**Files:**
- Modify: `src/utils/file.ts` (`serializeGarden`)
- Test: `src/utils/file.test.ts`

`splitBase` now drops `nursery`, so `serializeGarden`'s `...base` no longer emits it. Re-add the arrays explicitly (lossless authority — no `SerializedScene` needed).

- [ ] **Step 1: Write the failing test**

```ts
// add to src/utils/file.test.ts
import { describe, expect, it } from 'vitest';
import { serializeGarden, deserializeGarden } from './file';
import { blankGarden } from '../store/gardenStore';
import { createTray } from '../model/nursery';

describe('nursery persistence', () => {
  it('round-trips trays + seedlings through serialize/deserialize', () => {
    const g = blankGarden();
    g.nursery = { trays: [createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 'A' })], seedlings: [] };
    const round = deserializeGarden(serializeGarden(g));
    expect(round.nursery.trays.map((t) => t.label)).toEqual(['A']);
  });
});
```

(`blankGarden` is the exported well-formed factory at `gardenStore.ts:176`. If importing from `gardenStore` in a `utils` test creates an undesirable dependency cycle for your setup, use `useGardenStore.getState().reset(); const g = useGardenStore.getState().garden;` instead.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/file.test.ts -t "nursery persistence"`
Expected: FAIL — `round.nursery.trays` is empty (serialized output dropped nursery).

- [ ] **Step 3: Re-add `nursery` to `serializeGarden`**

In `src/utils/file.ts`, `serializeGarden` (line 58):

```ts
export function serializeGarden(garden: Garden): string {
  const base = splitBase(garden);
  return JSON.stringify(
    {
      ...base,
      nursery: garden.nursery,
      collection: projectCollectionForExport(garden.collection),
      scene: gardenToSerializedScene(garden),
    },
    null,
    2,
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/file.test.ts`
Expected: PASS (including existing file tests — legacy `.garden` files still load via the unchanged legacy branch).

- [ ] **Step 5: Commit**

```bash
git add src/utils/file.ts src/utils/file.test.ts
git commit -m "feat(nursery): persist nursery arrays after it leaves GardenBase"
```

---

## Task 5: Mount NurseryCanvas on SceneCanvas

**Files:**
- Modify: `src/canvas/NurseryCanvas.tsx`
- Test: `src/canvas/NurseryCanvas.test.tsx` (if one exists; else rely on tsc + visual gate)

Swap bare `<Canvas adapter={…}>` for `<SceneCanvas scene={…}>`, keeping eric's tools (takeover form) and custom layers. Reference `GardenCanvas.tsx:675-783` for the mount shape, but with dispatcher OFF and tools in takeover form.

- [ ] **Step 1: Update imports**

In `src/canvas/NurseryCanvas.tsx`, line 1-2:

```ts
import type { RenderLayer } from '@orochi235/weasel';
import { SceneCanvas, useCanvasSize, useTools } from '@orochi235/weasel';
```

(`Canvas` removed; `SceneCanvas` added; `useCanvasSize` + `useTools` kept — `useTools` is still used at line 273. **No provider import needed:** `NurseryCanvas` is only ever rendered by `GardenCanvas`, which already wraps both canvases in `<ActiveToolContextProviderIfRoot>` (`GardenCanvas.tsx:76-79`), so `useTools`'s `useActiveToolContext()` dependency is already satisfied by the parent.)

- [ ] **Step 2: Capture the nursery scene + keep the adapter for tools**

After `const adapter = useMemo(() => createNurserySceneAdapter(), []);` (line 81), add:

```ts
const nurseryScene = useMemo(() => useGardenStore.getState().getNurseryScene(), []);
```

(The `adapter` stays — eric's seed tools and `geometry.pickEvery` consume it. It is NOT passed to SceneCanvas.)

- [ ] **Step 3: Build the geometry + layers map for SceneCanvas**

SceneCanvas wants a `LayersMap` keyed by layer with slot configs, like garden's `sceneCanvasLayers` (`GardenCanvas.tsx:692-733`). The nursery already builds a `layers` record of `{ [id]: { layer } }`. Pass it through and add a `geometry` with the existing world-frame hit stack. Replace the `layers` memo's `return map;` consumer usage at the JSX with the same `map`, and add:

```ts
const geometry = useMemo(
  () => ({
    pickEvery: (x: number, y: number) => adapter.hitAll(x, y).map((n) => n.id),
    boundsOf: (id: string) => {
      const node = adapter.getNode(id);
      if (!node) return null;
      const p = adapter.getPose(id);
      // Tray: outer dims; seedling: cell-pitch box centered on the cell.
      if (node.kind === 'tray') return { x: p.x, y: p.y, width: node.data.widthIn, height: node.data.heightIn };
      const ss = useGardenStore.getState().garden.nursery;
      const tray = ss.trays.find((t) => t.id === node.data.trayId);
      const pitch = tray?.cellPitchIn ?? 1;
      return { x: p.x - pitch / 2, y: p.y - pitch / 2, width: pitch, height: pitch };
    },
  }),
  [adapter],
);
```

(`adapter.getPose` returns world `{x,y}` for both kinds per `nurseryScene.ts` adapter lines 153-170.)

- [ ] **Step 4: Replace the `<Canvas>` JSX**

Replace the `<Canvas<SeedNode, ScenePose> … />` block (line 300-310) with:

```tsx
{width > 0 && height > 0 && (
  <SceneCanvas
    scene={nurseryScene}
    width={width}
    height={height}
    view={toKitView(view)}
    onViewChange={handleViewChange}
    layers={layers as never}
    geometry={geometry}
    tools={tools}
    selectionMode="none"
    enableGestureDispatcher={false}
    enableKeybindings={false}
  />
)}
```

(No provider wrapper here — the parent `GardenCanvas` already supplies
`<ActiveToolContextProviderIfRoot>`.)

Rationale for each prop:
- `scene={nurseryScene}` — the live instance (required; replaces `adapter`).
- `tools={tools}` — **takeover form**: `tools` is the `ToolsApi` from `useTools(...)` (line 273), so SceneCanvas bypasses its internal select tool and forwards eric's tools as-is.
- `enableGestureDispatcher={false}` — eric's seed tools own gestures; no kit move/resize/area-select.
- `selectionMode="none"` — eric owns selection via `uiStore.selectedIds` (documented escape hatch; same stance as garden, see TODO "selectionMode='none' is correct").
- `enableKeybindings={false}` — eric's tools manage their own keys (matches today's bare-`<Canvas>` behavior, which had no kit keybinding layer).
- `layers={layers}` — the existing custom layers map (scene-slot painting is overridden by eric's own layers; no kit default scene slot needed since eric draws trays/seedlings itself).
- `geometry` — world-frame picking via `adapter.hitAll` (containers + children, multi-tray).

- [ ] **Step 5: Typecheck — the gate**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: **0 errors** (the `Canvas` import error is gone; no new errors). This is the primary success signal for the whole plan.

- [ ] **Step 6: Run nursery tests**

Run: `npx vitest run src/canvas`
Expected: PASS — seed tools, hit-test, layer tests all green. If a `NurseryCanvas.test.tsx` exists and asserts on the bare `<Canvas>`, update it to assert the `<SceneCanvas>` mount + `data-canvas-ready`.

- [ ] **Step 7: Commit**

```bash
git add src/canvas/NurseryCanvas.tsx
git commit -m "feat(nursery): mount NurseryCanvas on <SceneCanvas> (tools takeover, dispatcher off)"
```

---

## Task 6: Adapter cleanup + full gate

**Files:**
- Modify: `src/canvas/adapters/nurseryScene.ts` (only if the audit frees code)
- Modify: `src/canvas/NurseryCanvas.tsx` (if adapter usage shrinks)

- [ ] **Step 1: Audit `createNurserySceneAdapter` consumers**

Run: `grep -rn "createNurserySceneAdapter\|NurserySceneAdapter\|adapter\." src/canvas/NurseryCanvas.tsx src/canvas/tools/useSeedlingMoveTool.ts src/canvas/tools/useSeedSelectTool.ts src/canvas/tools/useSowCellTool.ts src/canvas/tools/useFillTrayTool.ts`

The adapter is still consumed by the seed tools (hit-testing, cell math, snap) and by `geometry.pickEvery`/`boundsOf` (Task 5). It is NO LONGER SceneCanvas's adapter. Leave it as a tool-facing helper. Do NOT delete it. Only remove any method that now has zero callers (e.g. if `setParent`/`setPose`/`findSnapTarget` were only there for a kit adapter contract that no longer applies — verify each has no remaining caller before removing). When in doubt, leave it.

- [ ] **Step 2: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS (all suites). Note the pre-change baseline count from the most recent green run (~798 per the Phase 7 step-3 commit; expect that plus the new nursery tests).

- [ ] **Step 3: Typecheck (both projects) + lint**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx biome check .`
Expected: tsc 0 eric-source errors; biome clean. (`tsc -b` may still surface weasel-internal noise unrelated to eric — the app-project check is the eric gate.)

- [ ] **Step 4: Visual smoke of the seed-starting view**

Launch the app (`/run` or the project's dev command), switch to seed-starting/nursery mode, and verify (headless Playwright per CLAUDE.md focus rules):
- trays render in auto-flow layout; seedlings render in cells
- click-select a seedling; marquee-select on empty tray background
- drag a seedling to another cell (cell-snapping move) and across trays
- sow via palette arming; fill-tray; tray rename overlay
- undo reverts the last nursery edit; pan/zoom/fit work

Expected: behavior identical to before the migration (eric tools unchanged).

- [ ] **Step 5: Final commit (if cleanup made changes)**

```bash
git add -A
git commit -m "chore(nursery): adapter audit + final gate after SceneCanvas mount"
```

---

## Self-review notes

- **Spec coverage:** scene shape (Task 1), reconcile (Task 2), two-scene store seam + compose + undo (Task 3), persistence (Task 4), canvas mount (Task 5), adapter audit + gate (Task 6). All spec sections mapped.
- **Type consistency:** `NurseryScene`/`NurseryPose`/`NurseryNodeData`/`NurseryLayer`/`NurseryBase` defined in Task 1 and reused verbatim in Tasks 2-3. `getNurseryScene` declared in the `GardenStore` interface (Task 3 Step 4) and consumed in Task 5. `splitNurseryBase`/`sceneToNursery`/`nurseryToScene`/`reconcileNurseryScene` signatures stable across tasks.
- **Risk — garden regression:** the `GardenBase`/`sceneToGarden` change (Task 3) touches garden-mode code; Step 7-8 explicitly re-run the garden facade/converter suites to catch it.
- **Risk — `ActiveToolContextProviderIfRoot`:** exact export name + placement verified against weasel dist and `GardenCanvas` during Task 5; fallback path documented inline.
- **Risk — tray order:** carried via the `order` field in tray node data (Task 1), tested in Task 2 Step 2 (reorder case) and Task 3 Step 6 (reorderTrays case).
