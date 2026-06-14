# Garden → SceneCanvas Phase 4: SerializedScene-snapshot undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert eric's garden undo/redo (and loadGarden/reset) to restore the weasel kit `Scene` **in place** via `scene.loadState(...)` instead of recreating the instance, and switch the undo stack from `Garden` snapshots to `{ scene: SerializedScene, base }` snapshots.

**Architecture:** A new `gardenToSerializedScene(garden)` serializer (the Phase 5 persistence building block, landed now) maps converter specs to a `SerializedScene`. `gardenHistory` stores `GardenSnapshot = { scene: SerializedScene, base }`; pushes capture the live scene via `scene.toJSON()`. Restores set `base` (overlaying the live nursery, preserving today's trick) then `scene.loadState(snap.scene)` — the instance is never recreated, and `loadState` clears the kit's internal undo stack each restore. Nursery-mode undo/redo is untouched.

**Tech Stack:** TypeScript, Zustand, weasel kit `Scene` (`@orochi235/weasel`: `toJSON`/`loadState`/`SerializedScene`/`SerializedNode`), Vitest, Biome.

---

## Context for the implementer

- This is **seam #3** of `docs/superpowers/specs/2026-06-14-garden-scenecanvas-migration-design.md` ("Undo"). Phase 1 already merged `scene.loadState()` into weasel; Phase 3 made forward mutations in-place via `reconcileScene`. This phase finishes the undo half.
- **Why:** today `adoptGarden` does `scene = createGardenScene(...)` — recreating the instance. Once Phase 6 mounts `<SceneCanvas scene={…}>`, the canvas captures the instance once; recreating it would orphan the canvas. So undo/redo/loadGarden/reset must mutate the **existing** instance.
- Read `src/store/gardenStore.ts` fully first (esp. lines ~225-313: facade, `composeGarden`, `invalidateComposed`, `subscribeScene`, `adoptGarden`, `patch`, `commitGarden`, `commitNursery`; and ~877-931: `checkpoint`/`undo`/`redo`). Read `src/scene/gardenConverters.ts`, `src/scene/gardenScene.ts`, and `src/store/history.ts`.
- **Key fact about the history stack:** `createHistoryStack` (`src/store/history.ts`) `structuredClone`s every value on `push`/`undo`/`redo`. So snapshots are deep-isolated from live state — no shared-reference hazard. `SerializedScene` and `GardenBase` are both `structuredClone`-safe (plain data; eric uses no `clipFromPose` functions, so no function fields and no `clipFromPoseKey`).
- **Kit `loadState` semantics** (`~/src/weasel/src/core/scene/scene.ts`): validates `version === 1`, clears nodes/roots/layers, rebuilds layers from `json.systemLayers`, clears the undo/redo stacks, applies the serialized nodes (which must be parent-before-child — both `toJSON` render order and `gardenToScene` spec order satisfy this), bumps `getVersion()`, and calls `notify()` (which fires eric's existing subscription).
- **The nursery-overlay trick** (preserve exactly): a garden-mode undo/redo must NOT revert nursery edits. Today: `adoptGarden({ ...prev.value, nursery: get().garden.nursery })`. New equivalent: `base = { ...snap.base, nursery: base.nursery }`.
- **Parity oracle:** the existing undo/redo tests in `src/store/gardenStore.test.ts` and `src/store/commitUpdate.test.ts` MUST stay green. Do not change them to fit the refactor — if one breaks, the refactor has a bug.

### Scope boundaries (do NOT touch)
- `commitNursery`, nursery-mode `undo`/`redo`, `nurseryHistory` — unchanged (still `NurseryState` snapshots restored via in-place `patch`).
- `patch`, `reconcileScene` — unchanged (Phase 3).
- Do not modify the kit or the gesture/canvas code.

---

## File structure

- **Modify** `src/scene/gardenScene.ts` — add the `GardenSerializedScene` type alias + import `SerializedScene`.
- **Modify** `src/scene/gardenConverters.ts` — add `gardenToSerializedScene(garden)`.
- **Modify** `src/scene/gardenConverters.test.ts` — round-trip test for the serializer.
- **Modify** `src/store/gardenStore.ts` — snapshot type, `currentGardenSnapshot`, `restoreSnapshot`, rewrite `adoptGarden`, retype `gardenHistory`, rewire `commitGarden`/`checkpoint`/`undo`/`redo`.
- **Create** `src/store/gardenStore.undo-inplace.test.ts` — Phase-4-specific behavior tests.

---

## Task 1: `GardenSerializedScene` type alias

**Files:**
- Modify: `src/scene/gardenScene.ts`

- [ ] **Step 1: Add the import and type alias**

In `src/scene/gardenScene.ts`, change the kit import on line 1 to also import `SerializedScene`:

```ts
import type { AddNodeSpec, Scene, SerializedScene } from '@orochi235/weasel';
```

Then, after the existing `GardenScene` / `GardenAddNodeSpec` type aliases (around line 65-66), add:

```ts
export type GardenSerializedScene = SerializedScene<GardenNodeData, GardenLayer, GardenPose>;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: only the 4 known `@weasel-js/history` TS2307 dts leaks; no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/scene/gardenScene.ts
git commit -m "feat(scene): add GardenSerializedScene type alias

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `gardenToSerializedScene` serializer (TDD)

**Files:**
- Modify: `src/scene/gardenConverters.ts`
- Test: `src/scene/gardenConverters.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/gardenConverters.test.ts` a new `describe` (the file already has `struct`/`plant`/`zone` helpers and imports `createGarden`, `gardenToScene`, `sceneToGarden`, `splitBase`, `createGardenScene` — reuse them; add `gardenToSerializedScene` to the import from `./gardenConverters`):

```ts
describe('gardenToSerializedScene', () => {
  it('produces a v1 SerializedScene that loadState round-trips back to the garden', () => {
    const g = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    g.structures = [
      struct({ id: 's1', x: 1, y: 1, width: 12, length: 12, container: true }),
      struct({ id: 's2', x: 14, y: 14, parentId: 's1' }),
    ];
    g.zones = [zone({ id: 'z1', x: 0, y: 20 })];
    g.plantings = [plant({ id: 'p1', parentId: 's1', x: 2, y: 2 })];

    const serialized = gardenToSerializedScene(g);
    expect(serialized.version).toBe(1);
    expect(serialized.systemLayers.map((l) => l.id)).toEqual([
      'ground', 'blueprint', 'structures', 'zones', 'plantings',
    ]);
    // Roots carry no `parent` key; children do.
    expect(serialized.nodes.find((n) => n.id === ('s1' as never))!.parent).toBeUndefined();
    expect(serialized.nodes.find((n) => n.id === ('s2' as never))!.parent).toBe('s1');

    // Load it into a fresh scene in place and confirm a lossless round-trip.
    const scene = createGardenScene([]);
    scene.loadState(serialized);
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.structures.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(out.zones.map((z) => z.id)).toEqual(['z1']);
    expect(out.plantings.map((p) => p.id)).toEqual(['p1']);
    // Nested child composes back to its world coords.
    expect(out.structures.find((s) => s.id === 's2')).toMatchObject({ x: 14, y: 14 });
    expect(out.structures.find((s) => s.id === 's1')).toMatchObject({ x: 1, y: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/gardenConverters.test.ts -t "gardenToSerializedScene"`
Expected: FAIL — `gardenToSerializedScene` is not exported.

- [ ] **Step 3: Implement the serializer**

In `src/scene/gardenConverters.ts`:

Add to the kit import on line 1:

```ts
import { asNodeId, composeRectPose, decomposeRectPose, type SerializedNode } from '@orochi235/weasel';
```

Add `GardenLayer`, `GardenNodeData`, `GardenPose`, `GardenSerializedScene`, and `GARDEN_LAYERS` to the import from `./gardenScene` (it currently imports types from there; add the value `GARDEN_LAYERS` and the new type):

```ts
import { GARDEN_LAYERS } from './gardenScene';
import type {
  GardenAddNodeSpec,
  GardenBase,
  GardenLayer,
  GardenNodeData,
  GardenPose,
  GardenScene,
  GardenSerializedScene,
} from './gardenScene';
```

Then add the function (place it right after `gardenToScene`, before `splitBase`):

```ts
/**
 * Serialize a Garden directly to a `SerializedScene` (the shape `scene.toJSON()`
 * emits and `scene.loadState()` consumes). Reuses `gardenToScene` for all
 * frame/footprint/container/layer logic, then maps the resulting specs to
 * serialized nodes. Spec order is parent-before-child, which `loadState`
 * requires. Backs both snapshot-undo restore and (Phase 5) `.garden` persistence.
 */
export function gardenToSerializedScene(garden: Garden): GardenSerializedScene {
  const specs = gardenToScene(garden);
  const nodes: SerializedNode<GardenNodeData, GardenLayer, GardenPose>[] = specs.map((s) => {
    const node: SerializedNode<GardenNodeData, GardenLayer, GardenPose> = {
      id: s.id!,
      kind: s.kind,
      layer: s.layer,
      pose: s.pose,
      data: s.data,
    };
    if (s.parent != null) node.parent = s.parent;
    return node;
  });
  return { version: 1, systemLayers: GARDEN_LAYERS.map((id) => ({ id })), nodes };
}
```

(`s.id!`: `AddNodeSpec.id` is typed `NodeId | undefined` but `gardenToScene` always sets it. `s.parent` is `NodeId | null | undefined`; `!= null` correctly skips both roots' `null` and `undefined`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/gardenConverters.test.ts`
Expected: PASS (the new round-trip plus all existing converter tests).

- [ ] **Step 5: Commit**

```bash
git add src/scene/gardenConverters.ts src/scene/gardenConverters.test.ts
git commit -m "feat(scene): gardenToSerializedScene — direct Garden → SerializedScene serializer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: In-place `adoptGarden` (loadGarden/reset path)

**Files:**
- Modify: `src/store/gardenStore.ts`

- [ ] **Step 1: Add imports**

In `src/store/gardenStore.ts`, add `gardenToSerializedScene` to the converters import (line 19) and `GardenSerializedScene` to the gardenScene type import (line 20):

```ts
import { gardenToScene, gardenToSerializedScene, sceneToGarden, splitBase } from '../scene/gardenConverters';
import type {
  GardenBase,
  GardenNodeData,
  GardenPose,
  GardenScene,
  GardenSerializedScene,
} from '../scene/gardenScene';
```

(Keep the existing `createGardenScene` value import on line 21.)

- [ ] **Step 2: Rewrite `adoptGarden` to restore in place**

Replace the current `adoptGarden` (around lines 285-292):

```ts
  function adoptGarden(next: Garden) {
    base = splitBase(next);
    scene = createGardenScene(gardenToScene(next));
    subscribeScene();
    overrides.clear();
    invalidateComposed();
    set({ garden: composeGarden() });
  }
```

with (update the JSDoc above it too):

```ts
  /**
   * Replace the whole garden from a full Garden snapshot — used by
   * loadGarden/reset. Restores the spatial scene IN PLACE via loadState (the
   * existing instance is preserved, so a mounted SceneCanvas keeps its ref) and
   * swaps the non-spatial base wholesale (including this garden's own nursery).
   */
  function adoptGarden(next: Garden) {
    base = splitBase(next);
    scene.loadState(gardenToSerializedScene(next));
    invalidateComposed();
    set({ garden: composeGarden() });
  }
```

Note: `subscribeScene()` is intentionally dropped — the instance is no longer recreated, so the bootstrap subscription stays valid. `overrides.clear()` is dropped (overrides is inert under SP1; the map is always empty). `scene` is no longer reassigned here.

- [ ] **Step 3: Run the parity suites**

Run: `npx vitest run src/store/`
Expected: PASS. `loadGarden`/`reset` tests exercise `adoptGarden`; undo/redo tests still run through the OLD garden-snapshot path at this point (you rewire them in Task 4) — they must still be green here. If a loadGarden/reset test fails, the in-place restore has a bug (e.g. base not swapped, or a missing publish).

- [ ] **Step 4: Commit**

```bash
git add src/store/gardenStore.ts
git commit -m "feat(store): adoptGarden restores scene in place via loadState (no recreation)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Switch `gardenHistory` to `GardenSnapshot` + rewire undo/redo

**Files:**
- Modify: `src/store/gardenStore.ts`
- Test: `src/store/gardenStore.undo-inplace.test.ts` (new)

- [ ] **Step 1: Write the failing/parity test (new file)**

Create `src/store/gardenStore.undo-inplace.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useGardenStore } from './gardenStore';
import { useUiStore } from './uiStore';

describe('gardenStore — Phase 4 in-place undo/redo', () => {
  beforeEach(() => {
    useUiStore.getState().setAppMode('garden');
    useGardenStore.getState().reset();
  });

  it('undo restores a structure position, redo re-applies it', () => {
    const store = useGardenStore.getState();
    const id = store.garden.structures[0].id;
    const startX = store.garden.structures[0].x;
    store.commitStructureUpdate(id, { x: startX + 3 });
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(startX + 3);

    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(startX);

    useGardenStore.getState().redo();
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(startX + 3);
  });

  it('undo reverts a base field (name) but NOT live nursery edits (overlay trick)', () => {
    const store = useGardenStore.getState();
    store.updateGarden({ name: 'Before' });
    // A spatial commit so there is a garden-undo entry capturing name='Before'.
    const id = useGardenStore.getState().garden.structures[0].id;
    const x0 = useGardenStore.getState().garden.structures[0].x;
    store.updateGarden({ name: 'After' });
    useGardenStore.getState().commitStructureUpdate(id, { x: x0 + 1 });

    // Edit the nursery AFTER the last garden snapshot was taken.
    useGardenStore.getState().addTray({
      id: 't1', label: 'Tray', rows: 2, cols: 2,
      slots: Array.from({ length: 4 }, () => ({ state: 'empty' as const, seedlingId: null })),
    });
    const trayCountBefore = useGardenStore.getState().garden.nursery.trays.length;

    // Garden-mode undo: reverts the spatial change; nursery must be untouched.
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(x0);
    expect(useGardenStore.getState().garden.nursery.trays.length).toBe(trayCountBefore);
  });

  it('survives many consecutive undo/redo cycles (instance preserved, keeps publishing)', () => {
    const store = useGardenStore.getState();
    const id = store.garden.structures[0].id;
    const x0 = store.garden.structures[0].x;
    for (let i = 1; i <= 5; i++) {
      useGardenStore.getState().commitStructureUpdate(id, { x: x0 + i });
    }
    for (let i = 0; i < 5; i++) useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(x0);
    for (let i = 0; i < 5; i++) useGardenStore.getState().redo();
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(x0 + 5);
  });
});
```

> Before relying on the exact `addTray`/`Tray` shape and `setAppMode`/`useUiStore` APIs, OPEN `src/store/uiStore.ts`, `src/model/nursery.ts`, and the existing nursery tests to confirm the real `Tray` shape and the `appMode` setter name. Adjust the test's tray literal / mode-setter call to match the actual API. The behaviors asserted (undo/redo of a spatial change; nursery-overlay on garden undo; multi-cycle stability) are the spec; the construction details must match the codebase.

- [ ] **Step 2: Run it against the still-Garden-snapshot code**

Run: `npx vitest run src/store/gardenStore.undo-inplace.test.ts`
Expected: These behaviors PASS already under the current Garden-snapshot path (they're the parity contract you must preserve). Confirm green, then do the refactor below and keep them green.

- [ ] **Step 3: Add the snapshot type + helpers**

In `src/store/gardenStore.ts`, near the facade module vars (around lines 235-244, by `const gardenHistory = …`):

Add the snapshot interface above the history declarations:

```ts
/** A garden-mode undo entry: the serialized spatial scene plus the non-spatial
 *  base. The live nursery is overlaid on restore (garden undo never reverts
 *  nursery edits — see restoreSnapshot). */
interface GardenSnapshot {
  scene: GardenSerializedScene;
  base: GardenBase;
}
```

Change the `gardenHistory` declaration:

```ts
const gardenHistory = createHistoryStack<GardenSnapshot>();
```

(Leave `nurseryHistory = createHistoryStack<NurseryState>()` unchanged.)

- [ ] **Step 4: Add `currentGardenSnapshot` and `restoreSnapshot`**

Inside the `create<GardenStore>((set, get) => { … })` body, near `adoptGarden` (so they can close over `scene`/`base`/`set`), add:

```ts
  /** Snapshot the live spatial scene + current base for the garden undo stack. */
  function currentGardenSnapshot(): GardenSnapshot {
    return { scene: scene.toJSON(), base };
  }

  /**
   * Restore a garden-mode undo/redo snapshot IN PLACE. Swaps base (overlaying
   * the LIVE nursery so a garden undo never reverts nursery edits) then loads
   * the serialized scene into the existing instance via loadState. Base is set
   * before loadState so the subscription's recompose sees the new base.
   */
  function restoreSnapshot(snap: GardenSnapshot) {
    base = { ...snap.base, nursery: base.nursery };
    invalidateComposed();
    scene.loadState(snap.scene);
    set({ garden: composeGarden() });
  }
```

- [ ] **Step 5: Rewire `commitGarden` and `checkpoint`**

Change `commitGarden` (around line 304-307) to push a snapshot instead of the composed garden:

```ts
  function commitGarden(updates: Partial<Garden>) {
    gardenHistory.push(currentGardenSnapshot(), useUiStore.getState().selectedIds);
    patch(updates);
  }
```

Change the garden branch of `checkpoint` (around lines 879-885) — the nursery branch is unchanged:

```ts
    checkpoint: () => {
      if (useUiStore.getState().appMode === 'nursery') {
        nurseryHistory.push(get().garden.nursery, useUiStore.getState().selectedIds);
      } else {
        gardenHistory.push(currentGardenSnapshot(), useUiStore.getState().selectedIds);
      }
    },
```

- [ ] **Step 6: Rewire the garden branches of `undo` and `redo`**

In `undo` (around lines 887-903), replace ONLY the garden (`else`) branch. The nursery branch stays as-is:

```ts
    undo: () => {
      const sel = useUiStore.getState().selectedIds;
      if (useUiStore.getState().appMode === 'nursery') {
        const prev = nurseryHistory.undo(get().garden.nursery, sel);
        if (prev) {
          patch({ nursery: prev.value });
          useUiStore.getState().setSelection(scrubSelection(prev.selectedIds, get().garden));
        }
      } else {
        const prev = gardenHistory.undo(currentGardenSnapshot(), sel);
        if (prev) {
          restoreSnapshot(prev.value);
          useUiStore.getState().setSelection(scrubSelection(prev.selectedIds, get().garden));
        }
      }
    },
```

In `redo` (around lines 905-921), replace ONLY the garden (`else`) branch:

```ts
    redo: () => {
      const sel = useUiStore.getState().selectedIds;
      if (useUiStore.getState().appMode === 'nursery') {
        const next = nurseryHistory.redo(get().garden.nursery, sel);
        if (next) {
          patch({ nursery: next.value });
          useUiStore.getState().setSelection(scrubSelection(next.selectedIds, get().garden));
        }
      } else {
        const next = gardenHistory.redo(currentGardenSnapshot(), sel);
        if (next) {
          restoreSnapshot(next.value);
          useUiStore.getState().setSelection(scrubSelection(next.selectedIds, get().garden));
        }
      }
    },
```

- [ ] **Step 7: Run the Phase-4 tests + full store suite**

Run: `npx vitest run src/store/`
Expected: PASS — the new `gardenStore.undo-inplace.test.ts` plus the existing `gardenStore.test.ts` / `commitUpdate.test.ts` undo/redo suites (the parity oracle). If any existing undo test fails, the rewire diverged from prior behavior — fix the store, not the test. Common culprits: forgetting the nursery overlay in `restoreSnapshot`, setting `base` after `loadState` (causes a transient wrong publish), or pushing the snapshot after the mutation instead of before.

- [ ] **Step 8: Commit**

```bash
git add src/store/gardenStore.ts src/store/gardenStore.undo-inplace.test.ts
git commit -m "feat(store): SerializedScene-snapshot undo restored in place via loadState

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Full gate run

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc -b`
Expected: only the 4 known `@weasel-js/history` TS2307 dts leaks; no new errors. In particular confirm `createGardenScene` / `gardenToScene` are still imported in `gardenStore.ts` if still referenced (bootstrap still uses them) — if one became unused, remove the dead import.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean. Fix any organizeImports/formatting in the touched files (`npx biome check --write` on just those if needed).

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: all green (≥ the 817 current count plus the new serializer + undo-inplace tests). No regressions, especially in `src/store/`.

- [ ] **Step 4: Visual suite**

Run: `npm run test:visual`
Expected: 4/4 (no rendering change — undo/redo produce the same composed garden, just via in-place restore). If it needs a dev server / has environment friction, report exactly what happened; do not spin up focus-stealing servers.

- [ ] **Step 5: Commit any lint fixups** (skip if none)

```bash
git add -A
git commit -m "chore(scene): lint/format fixups for Phase 4

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (reconciled against the spec)

- **Seam #3 coverage:** Tasks 3-4 convert undo/redo + loadGarden/reset to in-place `loadState`; the instance is never recreated. ✅
- **SerializedScene snapshots (Mike's choice):** `gardenHistory` now stores `{ scene, base }`; pushes use `scene.toJSON()`. ✅
- **Serializer front-run for Phase 5:** `gardenToSerializedScene` lands now, round-trip tested. ✅
- **Nursery-overlay trick preserved:** `restoreSnapshot` overlays the live nursery; nursery-mode undo/redo untouched. ✅
- **Kit-history discharge:** `loadState` clears the kit undo stack on every restore. ✅
- **Parity:** existing `gardenStore.test.ts` / `commitUpdate.test.ts` undo suites are the oracle and must stay green. ✅
- **Type consistency:** `GardenSerializedScene`, `GardenSnapshot`, `currentGardenSnapshot()`, `restoreSnapshot()`, `gardenToSerializedScene()` names are used identically across tasks. ✅
