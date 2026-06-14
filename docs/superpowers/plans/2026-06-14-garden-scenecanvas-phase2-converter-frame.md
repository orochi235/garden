# Phase 2 — Converter parent-local frame fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `gardenToScene` emit **parent-local** poses for nested structures/zones (and `sceneToGarden` compose them back to world), so the kit's `world = parent + child` pose composition renders nested containers correctly once SceneCanvas drives rendering.

**Architecture:** eric's `Garden` stores structures/zones in **world** coordinates (even when `parentId` is set); plantings store **parent-local** coordinates. The kit `Scene` treats every non-root node's pose as **local to its parent** and composes world via `composeRectPose(parentWorld, childLocal)`. Today the B1 Scene is passive storage (the live canvas bypasses kit composition), so the world-stored structure poses are never double-offset. Once SceneCanvas composes poses (Phase 6), a nested structure stored as world would render at `parentWorld + world`. Fix: convert world→local at `gardenToScene` (`decomposeRectPose`) and local→world at `sceneToGarden` (`composeRectPose`, composed up the parent chain). Plantings are already parent-local and need **no change** — they compose correctly once each ancestor's composed world equals its stored world.

**Tech Stack:** TypeScript, eric (`~/src/eric`), Vitest, weasel kit (`composeRectPose`/`decomposeRectPose` — public barrel exports of `@orochi235/weasel`).

**Scope note:** Seam #5 of the garden → SceneCanvas migration (spec: `docs/superpowers/specs/2026-06-14-garden-scenecanvas-migration-design.md`). Independent correctness fix; lands before the canvas swap. **No-op for today's data** (the app creates no structure-under-structure / zone-under-zone nesting — all `parentId` wiring is plantings-under-containers), but it closes a latent double-offset bug and is verified with synthetic nested fixtures. Rotation rides along as the child's **absolute** value (matching both eric's model and `composeRectPose`, which is translation-only); nesting under a *rotated* parent is not a case eric produces and is out of scope.

**All paths below are in `~/src/eric` (absolute: `/Users/mike/src/eric`).**

---

## File Structure

- `src/scene/gardenConverters.ts` — `gardenToScene` (structure + zone emit → parent-local); `sceneToGarden` (structure + zone → compose world up the chain); add `composeRectPose`/`decomposeRectPose` imports.
- `src/scene/gardenConverters.test.ts` — new `describe` block for nested-frame behavior.

No new files. Plantings paths are untouched.

Test command: `npx vitest run src/scene/gardenConverters.test.ts`

---

## Task 1: `gardenToScene` emits parent-local poses for nested structures/zones (TDD)

**Files:**
- Modify: `/Users/mike/src/eric/src/scene/gardenConverters.ts`
- Test: `/Users/mike/src/eric/src/scene/gardenConverters.test.ts`

- [ ] **Step 1: Add the failing tests.** Append this block to `gardenConverters.test.ts`. The file already defines `struct`, `zone`, `plant`, `createGarden`, `createGardenScene`, `gardenToScene`, `sceneToGarden`, `splitBase`. Add `composeRectPose` to the imports from `@orochi235/weasel` (the file already imports `asNodeId` from there).

```ts
// Helper: kit world pose of a node by composing local poses up the parent chain.
function kitWorld(scene: ReturnType<typeof createGardenScene>, id: string): { x: number; y: number; width: number; height: number } {
  const n = scene.get(id as never)!;
  return n.parent
    ? (composeRectPose(kitWorld(scene, String(n.parent)) as never, n.pose as never) as never)
    : (n.pose as never);
}

describe('gardenToScene nested frame (parent-local poses)', () => {
  it('stores a nested structure pose parent-local and composes back to the garden world pose', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.structures = [
      struct({ id: 's1', x: 1, y: 2, width: 10, length: 10, container: true }),
      struct({ id: 's2', x: 5, y: 6, width: 3, length: 3, parentId: 's1', container: true }),
    ];
    const scene = createGardenScene(gardenToScene(g));
    // Stored scene pose is local (world 5,6 minus parent world 1,2):
    expect(scene.get('s2' as never)!.pose).toMatchObject({ x: 4, y: 4 });
    // Kit composition recovers the world pose:
    expect(kitWorld(scene, 's2')).toMatchObject({ x: 5, y: 6 });
  });

  it('stores a nested zone pose parent-local', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.zones = [
      zone({ id: 'z1', x: 2, y: 3 }),
      zone({ id: 'z2', x: 7, y: 8, parentId: 'z1' }),
    ];
    const scene = createGardenScene(gardenToScene(g));
    expect(scene.get('z2' as never)!.pose).toMatchObject({ x: 5, y: 5 }); // 7-2, 8-3
    expect(kitWorld(scene, 'z2')).toMatchObject({ x: 7, y: 8 });
  });

  it('keeps a planting under a nested structure at the correct composed world position', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.structures = [
      struct({ id: 's1', x: 1, y: 2, container: true }),
      struct({ id: 's2', x: 5, y: 6, parentId: 's1', container: true }),
    ];
    g.plantings = [plant({ id: 'p1', parentId: 's2', x: 1, y: 1 })];
    const scene = createGardenScene(gardenToScene(g));
    // Planting local stays (1,1); composed world = s2 world (5,6) + (1,1) = (6,7),
    // which equals plantingWorldPose (parent.x + p.x).
    expect(scene.get('p1' as never)!.pose).toMatchObject({ x: 1, y: 1 });
    expect(kitWorld(scene, 'p1')).toMatchObject({ x: 6, y: 7 });
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/scene/gardenConverters.test.ts -t "nested frame"`
Expected: FAIL — `s2` pose is currently `{x:5,y:6}` (world), so the `{x:4,y:4}` assertion fails and `kitWorld` returns `{x:6,y:8}`.

- [ ] **Step 3: Implement the `gardenToScene` change.** In `gardenConverters.ts`:

  (a) Update the import line `import { asNodeId } from '@orochi235/weasel';` to:
```ts
import { asNodeId, composeRectPose, decomposeRectPose } from '@orochi235/weasel';
```
  (`composeRectPose` is used by `sceneToGarden` in Task 2; importing both now is fine.)

  (b) In `emitStruct`, the spec currently uses `pose: structurePose(s)`. The local `const parent = s.parentId ? structById.get(s.parentId) : undefined;` is already in scope. Change the `pose:` field to:
```ts
      pose: parent ? decomposeRectPose(structurePose(parent), structurePose(s)) : structurePose(s),
```

  (c) In `emitZone`, similarly the local `const parent = z.parentId ? zoneById.get(z.parentId) : undefined;` is in scope. Change `pose: zonePose(z)` to:
```ts
      pose: parent ? decomposeRectPose(zonePose(parent), zonePose(z)) : zonePose(z),
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npx vitest run src/scene/gardenConverters.test.ts -t "nested frame"`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the whole converter test file (existing flat tests must stay green — they're roots, so decompose is a no-op)**

Run: `npx vitest run src/scene/gardenConverters.test.ts`
Expected: PASS (all existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/scene/gardenConverters.ts src/scene/gardenConverters.test.ts
git commit -m "fix(scene): emit parent-local poses for nested structures/zones"
```

---

## Task 2: `sceneToGarden` composes nested poses back to world (TDD)

After Task 1 the Scene stores local poses for nested structures/zones, but `sceneToGarden` still reads `node.pose` directly — so a nested structure round-trips to its *local* coords, not its Garden *world* coords. Compose world up the parent chain.

**Files:**
- Modify: `/Users/mike/src/eric/src/scene/gardenConverters.ts`
- Test: `/Users/mike/src/eric/src/scene/gardenConverters.test.ts`

- [ ] **Step 1: Add the failing round-trip tests.** Append to `gardenConverters.test.ts`:

```ts
describe('sceneToGarden nested frame (compose world back)', () => {
  it('round-trips a nested structure to garden world coordinates (with rotation)', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.structures = [
      struct({ id: 's1', x: 1, y: 2, width: 10, length: 10, container: true }),
      struct({ id: 's2', x: 5, y: 6, width: 3, length: 3, rotation: 45, parentId: 's1', container: true }),
    ];
    const scene = createGardenScene(gardenToScene(g));
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.structures.find((s) => s.id === 's2')).toMatchObject({
      x: 5, y: 6, width: 3, length: 3, rotation: 45, parentId: 's1',
    });
  });

  it('round-trips multi-level nested structures', () => {
    const g = createGarden({ name: 'g', widthFt: 30, lengthFt: 30 });
    g.structures = [
      struct({ id: 'a', x: 1, y: 1, container: true }),
      struct({ id: 'b', x: 4, y: 5, parentId: 'a', container: true }),
      struct({ id: 'c', x: 9, y: 8, parentId: 'b', container: true }),
    ];
    const scene = createGardenScene(gardenToScene(g));
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.structures.find((s) => s.id === 'c')).toMatchObject({ x: 9, y: 8, parentId: 'b' });
    expect(out.structures.find((s) => s.id === 'b')).toMatchObject({ x: 4, y: 5, parentId: 'a' });
  });

  it('round-trips a nested zone to garden world coordinates', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.zones = [
      zone({ id: 'z1', x: 2, y: 3 }),
      zone({ id: 'z2', x: 7, y: 8, parentId: 'z1' }),
    ];
    const scene = createGardenScene(gardenToScene(g));
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.zones.find((z) => z.id === 'z2')).toMatchObject({ x: 7, y: 8, parentId: 'z1' });
  });

  it('round-trips a planting under a nested structure (local coords preserved)', () => {
    const g = createGarden({ name: 'g', widthFt: 20, lengthFt: 20 });
    g.structures = [
      struct({ id: 's1', x: 1, y: 2, container: true }),
      struct({ id: 's2', x: 5, y: 6, parentId: 's1', container: true }),
    ];
    g.plantings = [plant({ id: 'p1', parentId: 's2', x: 1, y: 1 })];
    const scene = createGardenScene(gardenToScene(g));
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.plantings.find((p) => p.id === 'p1')).toMatchObject({ parentId: 's2', x: 1, y: 1 });
  });
});
```

- [ ] **Step 2: Run to verify the new round-trip tests fail** (structures/zones come back local)

Run: `npx vitest run src/scene/gardenConverters.test.ts -t "compose world back"`
Expected: FAIL — `s2` returns `{x:4,y:6}`? No: returns local `{x:4,y:4}` for s2, so `{x:5,y:6}` assertion fails. (Planting test already passes — it's a guard.)

- [ ] **Step 3: Implement the `sceneToGarden` change.** In `gardenConverters.ts`, inside `sceneToGarden`:

  (a) Add a memoized world-pose resolver near the top of the function body (after the `const structures/zones/plantings` arrays are declared):
```ts
  // Structures/zones are stored parent-local in the Scene (kit frame); the Garden
  // stores them in world coords. Compose world up the parent chain, memoized.
  const worldCache = new Map<string, GardenPose>();
  function worldPoseOf(nodeId: string): GardenPose {
    const hit = worldCache.get(nodeId);
    if (hit) return hit;
    const n = scene.get(asNodeId(nodeId))!;
    const local = n.pose;
    const world = n.parent ? composeRectPose(worldPoseOf(String(n.parent)), local) : local;
    worldCache.set(nodeId, world);
    return world;
  }
```
  Add `GardenPose` to the existing `import type { ... } from './gardenScene';` line (it's exported there).

  (b) In the iteration, change `for (const [, node] of scene.nodes)` to `for (const [, node] of scene.nodes)` (id is read via `node.id`). For the **structure** branch, replace the `x`/`y`/`width`/`length`/`rotation`/`shape` source from `pose` with the composed world pose:
```ts
      const world = worldPoseOf(String(node.id));
      structures.push({
        id: String(node.id),
        type: data.type,
        shape: world.shape ?? 'rectangle',
        x: world.x,
        y: world.y,
        width: world.width,
        length: world.height,
        rotation: world.rotation ?? 0,
        // ...rest unchanged (color, label, zIndex, parentId, groupId, snapToGrid,
        //    surface, container, fill, layout, wallThicknessFt, clipChildren)
      });
```
  For the **zone** branch, likewise:
```ts
      const world = worldPoseOf(String(node.id));
      zones.push({
        id: String(node.id),
        x: world.x,
        y: world.y,
        width: world.width,
        length: world.height,
        // ...rest unchanged (color, label, zIndex, parentId, soilType, sunExposure, layout, pattern)
      });
```
  Leave the **planting** branch exactly as-is — it must keep `x: pose.x, y: pose.y` (Garden plantings are parent-local). Keep the existing `const pose = node.pose;`/`const data = node.data;`/`const parentId = ...` lines; the planting branch still uses `pose`.

- [ ] **Step 4: Run the round-trip tests to verify they pass**

Run: `npx vitest run src/scene/gardenConverters.test.ts -t "compose world back"`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the whole converter test file + the scene tests**

Run: `npx vitest run src/scene/gardenConverters.test.ts src/scene/gardenScene.test.ts src/scene/gardenFixtureRoundtrip.test.ts`
Expected: PASS (all). The fixture round-trip (flat real `.garden` data) is unaffected because roots compose to themselves.

- [ ] **Step 6: Commit**

```bash
git add src/scene/gardenConverters.ts src/scene/gardenConverters.test.ts
git commit -m "fix(scene): compose nested structure/zone poses back to world in sceneToGarden"
```

---

## Task 3: Full eric gate

**Files:** none (verify)

- [ ] **Step 1: Typecheck** (ignore only the 4 known weasel-history TS2307 dist leaks)

Run: `npx tsc -b 2>&1 | grep "error TS" | grep -v "packages/history"`
Expected: no output (0 eric-source errors).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: PASS — the prior baseline was 791; expect 791 + the 7 new converter tests = 798 (adjust if the baseline has shifted).

- [ ] **Step 4: Visual suite** (baselines must be unchanged — this fix is invisible for flat data)

Run: `npm run test:visual`
Expected: 4/4.

---

## Self-Review

- **Spec coverage:** Implements seam #5 (converter parent-local frame fix) — both directions (`gardenToScene` decompose, `sceneToGarden` compose) with multi-level + planting-under-nested + zone coverage. ✓
- **Placeholders:** none — concrete code and commands throughout. The two "...rest unchanged" markers in Task 2 Step 3 refer to fields that already exist verbatim in the current `sceneToGarden` branches; the implementer keeps them. ✓
- **Type consistency:** `decomposeRectPose(parentPose, childPose)` and `composeRectPose(parentWorld, childLocal)` are exact inverses (translation-only, preserve `width`/`height`/`rotation`/`shape` from the second/child argument). `structurePose`/`zonePose` return `GardenPose`-compatible shapes; `worldPoseOf` returns `GardenPose`; `kitWorld` (test helper) mirrors the same composition. Names match across both tasks. ✓
- **No-op safety:** for root nodes (every structure/zone in today's data) `decomposeRectPose`/`composeRectPose` are not called, so existing fixtures and visual baselines are unchanged. ✓
</content>
