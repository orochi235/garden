# Phase 1 — weasel `Scene.loadState()` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-place `Scene.loadState(serialized)` to weasel that replaces a live Scene's node/layer state from a `toJSON()` snapshot without recreating the instance.

**Architecture:** `sceneFromJSON()` already reconstructs a Scene from JSON, but only as a *new* instance with empty history. `<SceneCanvas>` holds the Scene instance and reads `scene` once, so eric's snapshot-undo and `.garden` load need to restore *into the existing instance*. We extract the shared "serialized → specs" mapping and the construction-time "apply specs (bypass log)" loop, then add `loadState` that resets state + history and replays the specs in place, bumping `version` and notifying subscribers.

**Tech Stack:** TypeScript, weasel kit (`~/src/weasel`), Vitest (project `kit`), tsup build.

**Scope note:** This is the only weasel change in the garden → SceneCanvas migration (design: `docs/superpowers/specs/2026-06-14-garden-scenecanvas-migration-design.md`, seam #3). Held for Mike's weasel sign-off before commit. Subsequent eric-side phases follow as their own plans:
> 2. Converter parent-local frame fix (#5) · 3. Fine-grained scene-op mutations (#2) · 4. Snapshot-the-Scene undo (#3 eric side) · 5. `SerializedScene` persistence + migration (#13) · 6. Canvas swap to `<SceneCanvas>` (#6) · 7. Gesture behavior-mapping audit + adopt kit select tool (#7) · 8. Verify.

**All paths below are in `~/src/weasel` (absolute: `/Users/mike/src/weasel`).**

---

## File Structure

- `src/core/scene/types.ts` — add `loadState` to the `Scene` interface (next to `toJSON`).
- `src/core/scene/scene.ts` — extract two shared helpers (`specsFromSerialized` module fn; `applyConstructionSpecs` inner fn), implement `loadState`, refactor `sceneFromJSON` + the `initial` loader to reuse them.
- `src/core/scene/scene.test.ts` — new `loadState` test block.

No new files. `loadState` lives on the Scene the same place `toJSON` does.

---

## Task 1: Extract `specsFromSerialized` (pure refactor, no behavior change)

`sceneFromJSON` builds `AddNodeSpec[]` from a `SerializedScene`. `loadState` needs the identical mapping. Extract it to a module-level helper and have `sceneFromJSON` call it.

**Files:**
- Modify: `/Users/mike/src/weasel/src/core/scene/scene.ts` (the `sceneFromJSON` function, ~lines 797-839)

- [ ] **Step 1: Add the module-level helper** (place it directly above `export function sceneFromJSON`)

```ts
/** Map a `SerializedScene` to construction specs. Shared by `sceneFromJSON`
 *  (new instance) and `Scene.loadState` (in-place). Validates version and
 *  resolves `clipFromPoseKey` → function via the registry; throws on an
 *  unsupported version or an unknown registry key. */
function specsFromSerialized<TData, TLayer extends string, TPose>(
  json: SerializedScene<TData, TLayer, TPose>,
  registry: SceneRegistry<TPose>,
): AddNodeSpec<TData, TLayer, TPose>[] {
  if (json.version !== 1) {
    throw new Error(`Scene: unsupported serialized version ${json.version}; only v1 supported`);
  }
  return json.nodes.map((n) => {
    const spec: AddNodeSpec<TData, TLayer, TPose> = {
      id: n.id as NodeId,
      kind: n.kind,
      layer: n.layer,
      pose: n.pose,
      data: n.data,
    };
    if (n.parent !== undefined) spec.parent = n.parent as NodeId;
    if (n.clipFromPoseKey !== undefined) {
      const fn = registry.clipFromPose?.[n.clipFromPoseKey];
      if (!fn) {
        throw new Error(
          `Scene: unknown clipFromPose key '${n.clipFromPoseKey}'. ` +
          `Register a function with this key in the registry option.`,
        );
      }
      (spec as { clipFromPose?: typeof fn }).clipFromPose = fn;
    }
    return spec;
  });
}
```

- [ ] **Step 2: Replace `sceneFromJSON`'s body to use it**

Replace the existing version-check + `json.nodes.map(...)` block (the lines from `if (json.version !== 1) {` through the end of the `const initial = json.nodes.map(...)` assignment) with:

```ts
  const registry = options.registry ?? {};
  const initial = specsFromSerialized(json, registry);
```

Leave the trailing `return createScene<...>({ systemLayers: json.systemLayers, initial, registry, ... })` exactly as-is.

- [ ] **Step 3: Run the existing scene tests — must stay green** (refactor changed no behavior)

Run: `cd /Users/mike/src/weasel && npx vitest run --project=kit src/core/scene/scene.test.ts`
Expected: PASS (same count as before the change).

- [ ] **Step 4: Commit**

```bash
cd /Users/mike/src/weasel
git add src/core/scene/scene.ts
git commit -m "refactor(scene): extract specsFromSerialized for reuse"
```

---

## Task 2: Extract `applyConstructionSpecs` (pure refactor, no behavior change)

The constructor's `initial` loader (lines ~755-779) does the bypass-the-log node insertion. `loadState` needs the same loop. Extract it to an inner function so both share it.

**Files:**
- Modify: `/Users/mike/src/weasel/src/core/scene/scene.ts` (inside `createScene`, the `if (options.initial)` block near the end, ~lines 754-780)

- [ ] **Step 1: Add the inner function** (place it just before the `if (options.initial)` block, so `runOp`, `siblingsOf`, `patchClipFromPose`, `generateId` etc. are in scope)

```ts
  /** Insert nodes without writing to the undo log — used by construction
   *  (`options.initial`) and by `loadState`. Specs must list parents before
   *  children (the order `toJSON()` emits). Throws on id collision, unknown
   *  layer, non-container parent, or cross-layer subtree. */
  function applyConstructionSpecs(specs: readonly AddNodeSpec<TData, TLayer, TPose>[]): void {
    for (const spec of specs) {
      const id = spec.id ?? generateId();
      if (state.nodes.has(id)) {
        throw new Error(`Scene: id collision on "${id}"`);
      }
      requireLayerIndex(spec.layer);
      const parent = spec.parent ?? null;
      if (parent !== null) {
        const p = requireNode(parent);
        if (p.kind !== 'container') {
          throw new Error(`Scene: parent "${parent}" is not a container`);
        }
        assertSubtreeLayer(spec.id, spec.layer, parent, p.layer);
      }
      const sibs = siblingsOf(parent);
      const index = spec.index ?? sibs.length;
      runOp('kit:add', {
        id, kind: spec.kind, layer: spec.layer, pose: spec.pose, data: spec.data,
        parent, index,
      });
      patchClipFromPose(spec, id);
    }
  }
```

- [ ] **Step 2: Replace the `initial` loader to call it**

Replace the body of the `if (options.initial) { ... }` block with:

```ts
  if (options.initial) {
    applyConstructionSpecs(options.initial);
    notify();
  }
```

- [ ] **Step 3: Run the existing scene tests — must stay green**

Run: `cd /Users/mike/src/weasel && npx vitest run --project=kit src/core/scene/scene.test.ts`
Expected: PASS (same count as Task 1).

- [ ] **Step 4: Commit**

```bash
cd /Users/mike/src/weasel
git add src/core/scene/scene.ts
git commit -m "refactor(scene): extract applyConstructionSpecs for reuse"
```

---

## Task 3: Declare `loadState` on the `Scene` interface

**Files:**
- Modify: `/Users/mike/src/weasel/src/core/scene/types.ts:268` (right after the `toJSON()` declaration, inside the `// Serialization` section)

- [ ] **Step 1: Add the interface method** (insert after the `toJSON(): SerializedScene<...>;` line)

```ts
  /** Replace this scene's entire node + layer state in place from a snapshot
   *  produced by `toJSON()`. Unlike `sceneFromJSON`, the existing Scene
   *  instance is preserved — holders such as `<SceneCanvas>` keep their
   *  reference. History (undo/redo) is cleared, matching `sceneFromJSON`.
   *  Bumps `getVersion()` and notifies subscribers exactly once.
   *
   *  Throws on an unsupported version or unknown registry/layer ids; on a
   *  malformed snapshot the scene is left empty (callers should treat a
   *  `loadState` throw as fatal and reload). Snapshots from `toJSON()` are
   *  always well-formed. */
  loadState(json: SerializedScene<TData, TLayer, TPose>): void;
```

- [ ] **Step 2: Typecheck — interface now has an unimplemented method, so `scene.ts` will error until Task 4**

Run: `cd /Users/mike/src/weasel && npx tsc -p tsconfig.json --noEmit 2>&1 | grep -i "loadState\|core/scene" | head`
Expected: an error that the object returned by `createScene` is missing `loadState` (this is expected; Task 4 fixes it). Do NOT commit yet.

---

## Task 4: Implement `loadState` (TDD)

**Files:**
- Test: `/Users/mike/src/weasel/src/core/scene/scene.test.ts`
- Modify: `/Users/mike/src/weasel/src/core/scene/scene.ts` (add `loadState` to the returned `scene` object, next to `toJSON`)

- [ ] **Step 1: Write the failing tests** — append this block to `scene.test.ts`. Adjust the import line only if the file already imports `createScene`/`sceneFromJSON` (reuse the existing import).

```ts
import { describe, expect, it, vi } from 'vitest';
import { createScene } from './scene';
import type { SystemLayerSpec } from './types';

describe('Scene.loadState', () => {
  type D = { kind: string; color: string };
  const LAYERS: SystemLayerSpec<'main'>[] = [{ id: 'main' }];

  function sceneWithTwoNodes() {
    const s = createScene<D, 'main'>({ systemLayers: LAYERS });
    s.add({ kind: 'leaf', layer: 'main', pose: { x: 1, y: 2, width: 3, height: 4 }, data: { kind: 'a', color: 'red' } });
    s.add({ kind: 'leaf', layer: 'main', pose: { x: 5, y: 6, width: 7, height: 8 }, data: { kind: 'b', color: 'blue' } });
    return s;
  }

  it('round-trips toJSON → loadState into an empty scene', () => {
    const src = sceneWithTwoNodes();
    const json = src.toJSON();
    const dst = createScene<D, 'main'>({ systemLayers: LAYERS });
    dst.loadState(json);
    expect(dst.toJSON()).toEqual(json);
    expect(dst.nodes.size).toBe(2);
  });

  it('preserves the instance, bumps version, and notifies once', () => {
    const dst = createScene<D, 'main'>({ systemLayers: LAYERS });
    const ref = dst;
    const listener = vi.fn();
    dst.subscribe(listener);
    const v0 = dst.getVersion();
    dst.loadState(sceneWithTwoNodes().toJSON());
    expect(dst).toBe(ref);
    expect(dst.getVersion()).toBeGreaterThan(v0);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('replaces existing content (wipes prior nodes)', () => {
    const dst = sceneWithTwoNodes();
    const emptyJson = createScene<D, 'main'>({ systemLayers: LAYERS }).toJSON();
    dst.loadState(emptyJson);
    expect(dst.nodes.size).toBe(0);
    expect(dst.roots.length).toBe(0);
  });

  it('clears history (no undo/redo after load)', () => {
    const dst = sceneWithTwoNodes();
    expect(dst.canUndo()).toBe(true);
    dst.loadState(sceneWithTwoNodes().toJSON());
    expect(dst.canUndo()).toBe(false);
    expect(dst.canRedo()).toBe(false);
  });

  it('restores layer visibility/lock flags', () => {
    const src = createScene<D, 'main'>({ systemLayers: [{ id: 'main' }] });
    src.setLayerVisible('main', false);
    src.setLayerLocked('main', true);
    const dst = createScene<D, 'main'>({ systemLayers: [{ id: 'main' }] });
    dst.loadState(src.toJSON());
    expect(dst.layers[0].visible).toBe(false);
    expect(dst.layers[0].locked).toBe(true);
  });

  it('throws on an unsupported version', () => {
    const dst = createScene<D, 'main'>({ systemLayers: LAYERS });
    expect(() => dst.loadState({ version: 2, systemLayers: LAYERS, nodes: [] } as never)).toThrow(/version/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/mike/src/weasel && npx vitest run --project=kit src/core/scene/scene.test.ts -t loadState`
Expected: FAIL — `dst.loadState is not a function`.

- [ ] **Step 3: Implement `loadState`** — add this property to the returned `scene` object literal, directly after the `toJSON()` method (before `subscribe`)

```ts
    loadState(json) {
      // Validate + map up front (throws before we touch live state on a bad
      // version or unknown registry key).
      const specs = specsFromSerialized(json, registry);
      // Reset node + layer state.
      state.nodes.clear();
      state.roots.length = 0;
      state.layers.length = 0;
      state.layerIndex.clear();
      for (let i = 0; i < json.systemLayers.length; i++) {
        const spec = json.systemLayers[i];
        if (state.layerIndex.has(spec.id)) {
          throw new Error(`Scene.loadState: duplicate system layer id "${spec.id}"`);
        }
        state.layers.push({
          kind: 'system',
          id: spec.id,
          visible: spec.visible ?? true,
          locked: spec.locked ?? false,
        });
        state.layerIndex.set(spec.id, i);
      }
      // Clear history + transient batch/clip caches.
      undoStack.length = 0;
      redoStack.length = 0;
      pendingClipPatches.clear();
      currentBatch = null;
      batchDepth = 0;
      batchDirty = false;
      // Rebuild nodes (bypass the log, exactly like construction).
      applyConstructionSpecs(specs);
      notify();
    },
```

- [ ] **Step 4: Run the loadState tests to verify they pass**

Run: `cd /Users/mike/src/weasel && npx vitest run --project=kit src/core/scene/scene.test.ts -t loadState`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full scene test file + typecheck**

Run: `cd /Users/mike/src/weasel && npx vitest run --project=kit src/core/scene/scene.test.ts && npx tsc -p tsconfig.json --noEmit 2>&1 | grep -i "core/scene" | head`
Expected: all scene tests PASS; no `core/scene` typecheck errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/mike/src/weasel
git add src/core/scene/types.ts src/core/scene/scene.ts src/core/scene/scene.test.ts
git commit -m "feat(scene): add Scene.loadState for in-place snapshot restore"
```

---

## Task 5: Full weasel gate + rebuild dist for eric

**Files:** none (build + verify)

- [ ] **Step 1: Run weasel's full test suite**

Run: `cd /Users/mike/src/weasel && npm test`
Expected: PASS across projects `kit`, `weasel-ui`, `draw`, `smoke`.

- [ ] **Step 2: Rebuild dist** (eric consumes the symlinked build)

Run: `cd /Users/mike/src/weasel && npm run build`
Expected: tsup completes; `dist/` updated.

- [ ] **Step 3: Bust eric's Vite cache** (the symlinked dep is cached)

Run: `rm -rf /Users/mike/src/eric/node_modules/.vite`
Expected: no output. (Restart `npm run dev` in eric if a server is running.)

- [ ] **Step 4: Confirm `loadState` is in the built dist**

Run: `grep -rl "loadState" /Users/mike/src/weasel/dist | head`
Expected: at least one `dist/*.js` (and a `.d.ts`) contains `loadState`.

---

## Hold for sign-off

Per the design doc and `weasel-pin` norms, **do not let weasel drift**: this commit plus the still-pending `tsup splitting:true` font fix are the uncommitted weasel changes awaiting Mike's sign-off. Surface both together when asking him to sign off on the weasel build.

---

## Self-Review

- **Spec coverage:** Implements design seam #3's weasel half (`Scene.loadState`) — the migration's only Design-Into-Weasel item. Backs both undo-restore (Phase 4) and `.garden` load (Phase 5). ✓
- **Placeholders:** none — every step has concrete code or an exact command. ✓
- **Type consistency:** `specsFromSerialized(json, registry)` and `applyConstructionSpecs(specs)` names are used identically in Tasks 1, 2, and 4. `loadState(json)` matches the interface signature in Task 3. Returned-object property style (`loadState(json) { … }`) matches the existing `toJSON()` / `subscribe()` shorthand in the same literal. ✓
- **Risk — partial state on throw:** documented in the interface JSDoc; `specsFromSerialized` validates version/registry *before* any state mutation, so the common bad-input cases throw cleanly. ✓
</content>
