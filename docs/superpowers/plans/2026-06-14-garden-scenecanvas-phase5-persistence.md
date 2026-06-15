# Garden → SceneCanvas Phase 5: SerializedScene persistence + legacy migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change eric's `.garden` / autosave on-disk format from spatial arrays (`{ ...base, structures, zones, plantings }`) to a serialized Scene (`{ ...base, scene: SerializedScene }`), while keeping older garden-array files loadable via the existing legacy-migration pipeline. Autosave/localStorage migrate transparently because they share `serializeGarden`/`deserializeGarden`.

**Architecture:** Entirely contained in `src/utils/file.ts` (+ tests). `serializeGarden` emits the non-spatial base plus `scene: gardenToSerializedScene(garden)` (the serializer landed in Phase 4) and drops the three spatial arrays. `deserializeGarden` keeps returning a `Garden` (caller contract unchanged — App.tsx / store / autosave untouched): it detects format by the presence of a `scene` key — **new** → load the serialized scene into a throwaway `createGardenScene([])` and `sceneToGarden(scene, base)` to reconstruct the arrays; **legacy** (`structures`/`zones`/`plantings`, no `scene`) → the current migration pipeline unchanged. Nested poses persist **parent-local** (the Phase 2 frame fix), so the new format round-trips losslessly through kit composition.

**Tech Stack:** TypeScript, weasel kit `Scene` (`@orochi235/weasel`: `SerializedScene`, `loadState`), the eric converters (`gardenToSerializedScene`, `sceneToGarden`, `splitBase`, `createGardenScene`), Vitest, Biome.

---

## Context for the implementer

- This is **seam #13 ("`.garden` persistence")** of `docs/superpowers/specs/2026-06-14-garden-scenecanvas-migration-design.md`. Read its "Persistence format (seam #13 detail)" section and the Phase 5 line in "Implementation phases".
- **Read first, fully:** `src/utils/file.ts` (the whole file — `serializeGarden`, `deserializeGarden`, the migration helpers `migrateHeightToLength`/`stripLegacyFields`/`migrateLayoutsToCellGrid`/`snapPlantingsToCellGrid`, `hydrateCollection`/`projectCollectionForExport`, `autosave`/`loadAutosave`). Then `src/scene/gardenConverters.ts` (`gardenToSerializedScene` @ ~152, `splitBase` @ 168, `sceneToGarden` @ 174) and `src/scene/gardenScene.ts` (`GardenBase` @ 70, `createGardenScene` @ 72, `GardenSerializedScene`).
- **Why this is safe / contained:** `deserializeGarden`'s return type stays `Garden`. Production callers — `src/components/App.tsx` (`loadGarden(deserializeGarden(...))`, `autosave(garden)`) and `src/utils/file.ts` itself (`downloadGarden`/`openGardenFile`/`loadAutosave`) — all pass/receive a `Garden` and are **not touched**. The store is **not touched** (its `adoptGarden` already re-serializes the Garden via `gardenToSerializedScene`; Phase 4).
- **Format detection rule:** `data.scene != null` → new format. `scene` was never a `Garden` field, so this is unambiguous; legacy files never carry it. New-format files written by the new `serializeGarden` have **no** `structures`/`zones`/`plantings` keys (`splitBase` strips them).
- **Lossless round-trip is already proven:** Phase 4's `gardenToSerializedScene → loadState → sceneToGarden` round-trip (including a nested child composing back to world coords) is tested in `src/scene/gardenConverters.test.ts`. Phase 5 reuses exactly that path inside `deserializeGarden`.
- **`GardenBase` shape:** `Omit<Garden, 'structures' | 'zones' | 'plantings'>` — so it includes `version`, `name`, `widthFt`, `lengthFt`, `gridCellSizeFt`, `displayUnit`, `groundColor`, `blueprint`, `collection`, `nursery`, etc. For a new-format file, `{ ...data }` minus `scene` is already `GardenBase`-shaped.
- **Migration helpers are array-guarded:** `migrateHeightToLength` and `stripLegacyFields` both guard with `Array.isArray(...)`, so they no-op on new-format data (which has no arrays). They can run unconditionally before the format branch. But `migrateLayoutsToCellGrid` / `snapPlantingsToCellGrid` iterate `garden.structures`/`.zones` directly and **must only run on the legacy branch** (after a `Garden` with arrays exists).

### Parity oracles (must stay green)
- `src/scene/gardenFixtureRoundtrip.test.ts` — loads the real **legacy-format** `public/*.garden` fixtures via `deserializeGarden` and round-trips through the converters. It never calls `serializeGarden`. It exercises the **legacy path** and must stay green untouched. **Do NOT convert the `public/*.garden` fixtures to the new format** — they keep exercising the legacy load path.
- `src/scene/gardenConverters.test.ts` — converter/serializer round-trip. Untouched.
- The existing `src/utils/file.test.ts` legacy-migration assertions (heightFt→lengthFt, seedStarting→nursery, collection hydrate, strip-dead-fields). Their **behavior** is preserved; only fixtures that were built via `JSON.parse(serializeGarden(...))` and then mutated `.structures`/`.zones` need re-expressing as hand-built legacy literals (Task 2).

### Scope boundaries (do NOT touch)
- `src/store/gardenStore.ts`, the kit, gestures, canvas — unchanged.
- `App.tsx` and all other production callers — unchanged.
- The `public/*.garden` fixtures — unchanged (stay legacy format).
- `serializeGarden`'s collection projection (`projectCollectionForExport`) and all legacy migration helpers — logic unchanged; only `serializeGarden`'s output object and `deserializeGarden`'s control flow change.

---

## File structure

- **Modify** `src/utils/file.ts` — `serializeGarden` (emit `scene` + base, drop arrays) and `deserializeGarden` (format branch + new-format reconstruction; import `gardenToSerializedScene`, `sceneToGarden`, `splitBase`, `createGardenScene`, and the `GardenSerializedScene` type).
- **Modify** `src/utils/file.test.ts` — add new-format round-trip + lossless-nested + autosave tests; re-express the one strip-dead-fields fixture as a hand-built legacy literal.
- **Modify** `src/store/gardenSceneFacade.test.ts` — stop reading raw `.structures`/`.zones`/`.plantings` off `serializeGarden` output; round-trip through `deserializeGarden` (idempotent on the new path) instead.

---

## Task 1: New on-disk format — `serializeGarden` + `deserializeGarden` new-format branch (TDD)

**Files:**
- Modify: `src/utils/file.ts`
- Test: `src/utils/file.test.ts`

- [ ] **Step 1: Write the failing round-trip test**

Append a new `describe` to `src/utils/file.test.ts`. Add `getCultivar` is already imported; you need `createGardenScene` is NOT needed here. Add imports at top if missing: nothing new beyond `createGarden`, `serializeGarden`, `deserializeGarden` (already imported). Build a garden with nested structures/zones/plantings using the real model — to avoid guessing `Structure`/`Zone`/`Planting` shapes, construct via `createGarden` then push minimal literals mirroring `src/scene/gardenConverters.test.ts`'s `struct`/`zone`/`plant` helpers (open that file and copy the helper shapes, or import nothing and inline the same field set the converters test uses). Assert the disk shape and a lossless round-trip:

```ts
describe('serializeGarden / deserializeGarden — SerializedScene format (Phase 5)', () => {
  it('writes the new scene format on disk (scene key, no spatial arrays)', () => {
    const g = createGarden({ name: 'New', widthFt: 30, lengthFt: 30 });
    const onDisk = JSON.parse(serializeGarden(g));
    expect(onDisk.scene).toBeDefined();
    expect(onDisk.scene.version).toBe(1);
    expect(onDisk.structures).toBeUndefined();
    expect(onDisk.zones).toBeUndefined();
    expect(onDisk.plantings).toBeUndefined();
    // Non-spatial base still present.
    expect(onDisk.name).toBe('New');
    expect(onDisk.version).toBe(1);
    expect(onDisk.nursery).toBeDefined();
  });

  it('round-trips a garden with nested structures/zones/plantings losslessly', () => {
    const g = createGarden({ name: 'Round', widthFt: 30, lengthFt: 30 });
    // Mirror the field set used in gardenConverters.test.ts's struct/zone/plant helpers.
    // (Open that file; copy the exact literal shapes so the model stays valid.)
    g.structures = [
      /* container s1 at world (1,1), 12x12 */,
      /* child s2 parentId s1 at world (14,14) */,
    ];
    g.zones = [ /* z1 at (0,20) */ ];
    g.plantings = [ /* p1 parentId s1 at (2,2) */ ];

    const restored = deserializeGarden(serializeGarden(g));
    expect(restored.structures.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(restored.zones.map((z) => z.id)).toEqual(['z1']);
    expect(restored.plantings.map((p) => p.id)).toEqual(['p1']);
    // Nested child composes back to its world coords (Phase 2 frame fix).
    expect(restored.structures.find((s) => s.id === 's2')).toMatchObject({ x: 14, y: 14 });
    expect(restored.structures.find((s) => s.id === 's1')).toMatchObject({ x: 1, y: 1 });
  });
});
```

> The two block-comment placeholders MUST be replaced with the real literals from `gardenConverters.test.ts`'s `struct`/`zone`/`plant` helpers (same ids/coords as that file's `gardenToSerializedScene` test: `s1` container 12×12 at (1,1); `s2` child of `s1` at world (14,14); `z1` at (0,20); `p1` child of `s1` at (2,2)). Reuse those helpers verbatim if you import them, or inline the identical field set. Do not invent a different `Structure`/`Zone`/`Planting` shape.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/file.test.ts -t "SerializedScene format"`
Expected: FAIL — `onDisk.scene` is undefined / arrays still present (serialize unchanged); round-trip restores via the legacy path which has no arrays to read.

- [ ] **Step 3: Implement the format change**

In `src/utils/file.ts`:

Add to the top imports:

```ts
import { gardenToSerializedScene, sceneToGarden, splitBase } from '../scene/gardenConverters';
import { createGardenScene } from '../scene/gardenScene';
import type { GardenSerializedScene } from '../scene/gardenScene';
```

Rewrite `serializeGarden` to emit base + `scene`, dropping the spatial arrays (`splitBase` removes `structures`/`zones`/`plantings`; re-apply the collection projection):

```ts
export function serializeGarden(garden: Garden): string {
  const base = splitBase(garden);
  return JSON.stringify(
    {
      ...base,
      collection: projectCollectionForExport(garden.collection),
      scene: gardenToSerializedScene(garden),
    },
    null,
    2,
  );
}
```

Rewrite `deserializeGarden` to branch on format. Keep the common base validation/hydration (it applies to both); the array-only migrations stay on the legacy branch:

```ts
export function deserializeGarden(json: string): Garden {
  const data = JSON.parse(json);
  // Legacy field migrations are array-guarded → no-op on new-format data.
  migrateHeightToLength(data);
  stripLegacyFields(data);
  if (!data.version || !data.name || data.widthFt == null || data.lengthFt == null) {
    throw new Error('Invalid garden file: missing required fields');
  }
  // Legacy `seedStarting` → `nursery` rename (applies to both formats defensively).
  if (data && typeof data === 'object' && data.seedStarting && !data.nursery) {
    data.nursery = data.seedStarting;
    delete data.seedStarting;
  }
  if (!data.nursery) data.nursery = emptyNurseryState();
  data.collection = hydrateCollection(data.collection);

  // New (scene-native) format: reconstruct the spatial arrays from the
  // serialized scene by loading it into a throwaway instance, then composing
  // a Garden via sceneToGarden. Nested poses are stored parent-local, so the
  // converter composes them back to world coords (Phase 2/4 frame handling).
  if (data.scene != null) {
    const { scene: serialized, ...base } = data;
    const scene = createGardenScene([]);
    scene.loadState(serialized as GardenSerializedScene);
    return sceneToGarden(scene, base as GardenBase);
  }

  // Legacy (garden-array) format.
  migrateLayoutsToCellGrid(data as Garden);
  snapPlantingsToCellGrid(data as Garden);
  return data as Garden;
}
```

Add the `GardenBase` type to the imports if not already present (it isn't — add it):

```ts
import type { GardenBase } from '../scene/gardenScene';
```

(Consolidate the two `gardenScene` type imports into one `import type { GardenBase, GardenSerializedScene } from '../scene/gardenScene';`.)

- [ ] **Step 4: Run to verify the new tests pass**

Run: `npx vitest run src/utils/file.test.ts -t "SerializedScene format"`
Expected: PASS (disk-shape + lossless nested round-trip).

- [ ] **Step 5: Run the full file.test.ts suite — note which legacy tests now fail**

Run: `npx vitest run src/utils/file.test.ts`
Expected: the `strips dead legacy fields ...` test (and any other that does `JSON.parse(serializeGarden(...))` then mutates `.structures`/`.zones`) now FAILS with a `Cannot read properties of undefined (reading 'push')` — those build a legacy fixture off the new serialize output. Task 2 fixes them. All format-independent tests (nursery backfill, seedStarting rename, collection hydrate/projection, heightFt→lengthFt hand-built literal) must already be green.

---

## Task 2: Re-express format-coupled legacy tests as hand-built legacy literals

**Files:**
- Modify: `src/utils/file.test.ts`

- [ ] **Step 1: Fix the `strips dead legacy fields` test**

That test currently does `const raw = JSON.parse(serializeGarden(garden));` then `raw.structures.push(...)` / `raw.zones.push(...)`. Replace the `JSON.parse(serializeGarden(...))` base with a **hand-built legacy garden literal** (a plain object with `version`/`name`/`widthFt`/`lengthFt` + `structures: [...]` / `zones: [...]` arrays already containing the legacy-field-bearing entries — no `scene` key, so it takes the legacy path). Use the existing `migrates legacy heightFt → lengthFt` test (which already builds a legacy literal by hand) as the template for required top-level fields. Keep every assertion (`arrangement`/`trellisEdge`/`pattern` stripped from the structure; `arrangement` stripped from the zone; `pattern` preserved on the zone) **unchanged** — only the fixture construction changes.

- [ ] **Step 2: Audit the rest of the file for the same pattern**

Grep the test file for `serializeGarden(` and confirm every remaining use is either (a) asserting the new on-disk shape, or (b) a full round-trip `deserializeGarden(serializeGarden(...))` that does not poke `.structures`/`.zones`/`.plantings` on the parsed disk object. The collection tests (`strips builtin cultivars`, `preserves custom cultivars`, `accepts legacy files where collection holds full Cultivar`) read `onDisk.collection` only — fine (collection stays top-level in the new format). The nursery/seedStarting tests delete/rename top-level `nursery` — fine. Leave those as-is.

- [ ] **Step 3: Run the full file suite**

Run: `npx vitest run src/utils/file.test.ts`
Expected: PASS (all legacy-migration behavior + new format).

- [ ] **Step 4: Commit Tasks 1–2**

```bash
git add src/utils/file.ts src/utils/file.test.ts
git commit -m "feat(persist): .garden/autosave persist SerializedScene; legacy arrays still load

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Repair `gardenSceneFacade.test.ts` (no longer reads raw disk arrays)

**Files:**
- Modify: `src/store/gardenSceneFacade.test.ts`

- [ ] **Step 1: Round-trip through `deserializeGarden` instead of reading raw arrays**

In `src/store/gardenSceneFacade.test.ts` (the `store round-trip: .garden -> loadGarden(scene) -> serialize` block, ~lines 84–93), the test reads spatial arrays off `JSON.parse(serializeGarden(...))`. The new format has no arrays there. Replace:

```ts
const savedRaw = JSON.parse(serializeGarden(useGardenStore.getState().garden)) as { … };
```

with a true disk round-trip (the new-format `deserializeGarden` path does NOT run `snapPlantingsToCellGrid`, so it is idempotent — the old "parse raw to avoid re-snapping" caveat no longer applies):

```ts
const savedRaw = deserializeGarden(serializeGarden(useGardenStore.getState().garden));
```

`savedRaw` is now a `Garden`, so `savedRaw.structures` / `.zones` / `.plantings` / `.nursery` / `.name` / `.widthFt` / `.lengthFt` all resolve directly. `savedRaw.collection` is a full `Cultivar[]`; the existing `savedRaw.collection.map((c) => c.id)` assertion still works (drop the `as { collection: Array<{ id: string }> }` cast). Remove the now-unnecessary `savedRaw` type cast object entirely.

- [ ] **Step 2: Update the stale comment**

Replace the comment block above the old `JSON.parse(serializeGarden(...))` (the one explaining "we avoid `deserializeGarden` because `snapPlantingsToCellGrid` isn't idempotent") with a one-liner: the new scene format reconstructs via `sceneToGarden` (no snap migration), so a full `deserializeGarden(serializeGarden(...))` disk round-trip is idempotent and is exactly what we want to compare.

- [ ] **Step 3: Run the facade suite**

Run: `npx vitest run src/store/gardenSceneFacade.test.ts`
Expected: PASS for all five fixtures (`default`, `marinara`, `salsa`, `eight-tomatoes`, `trellis-bed`). If a plant/structure coord mismatches, the new-format round-trip lost something the old raw-read tolerated — investigate the converter, not the assertion.

- [ ] **Step 4: Commit**

```bash
git add src/store/gardenSceneFacade.test.ts
git commit -m "test(store): facade round-trip asserts via deserialize(serialize()) disk round-trip

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Autosave transparent-migration test

**Files:**
- Modify: `src/utils/file.test.ts`

- [ ] **Step 1: Add an autosave round-trip + legacy-autosave-load test**

`autosave`/`loadAutosave` use `localStorage`; the vitest jsdom env provides it (confirm `src/test-setup.ts` doesn't stub it away — if it does, use the existing pattern there). Add:

```ts
import { autosave, loadAutosave } from './file';

describe('autosave — transparent SerializedScene migration', () => {
  it('autosave → loadAutosave round-trips the garden', () => {
    const g = createGarden({ name: 'Auto', widthFt: 12, lengthFt: 12 });
    autosave(g);
    const back = loadAutosave();
    expect(back?.name).toBe('Auto');
    expect(back?.structures.map((s) => s.id).sort()).toEqual(g.structures.map((s) => s.id).sort());
  });

  it('loadAutosave still reads a legacy garden-array autosave', () => {
    // Hand-built legacy autosave blob (no scene key) → legacy path.
    localStorage.setItem(
      'garden-planner-autosave',
      JSON.stringify({
        version: 1, name: 'LegacyAuto', widthFt: 10, lengthFt: 10,
        structures: [], zones: [], plantings: [], collection: [],
      }),
    );
    const back = loadAutosave();
    expect(back?.name).toBe('LegacyAuto');
  });
});
```

> Confirm the `AUTOSAVE_KEY` literal (`'garden-planner-autosave'`) against `src/utils/file.ts` before hardcoding it; if the test env isolates localStorage per-test, set it inside the test as shown. If `createGarden` seeds default structures, the first assertion still holds (it compares the same garden's own ids through the round-trip).

- [ ] **Step 2: Run**

Run: `npx vitest run src/utils/file.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/utils/file.test.ts
git commit -m "test(persist): autosave round-trips new format; legacy autosave still loads

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Full gate run

**Files:** none (verification only)

- [ ] **Step 1: Typecheck** — `npx tsc -b`
  Expected: only the 4 known `@weasel-js/history` TS2307 dts leaks; no new errors. Confirm no now-unused imports remain in `file.ts` (the old code imported nothing that becomes dead, but verify).

- [ ] **Step 2: Lint** — `npm run lint`
  Expected: clean. `npx biome check --write src/utils/file.ts src/utils/file.test.ts src/store/gardenSceneFacade.test.ts` if organizeImports/format needs a nudge.

- [ ] **Step 3: Full test suite** — `npm test`
  Expected: all green, ≥ the 821 current count plus the new persistence tests. Watch `src/scene/gardenFixtureRoundtrip.test.ts` (legacy path) and `src/store/gardenSceneFacade.test.ts` especially.

- [ ] **Step 4: Visual suite** — `npm run test:visual`
  Expected: 4/4 (no rendering change — persistence only; fixtures still load identically). If it needs a dev server / has environment friction, report exactly what happened; do not spin up focus-stealing servers.

- [ ] **Step 5: Commit any lint fixups** (skip if none)

```bash
git add -A
git commit -m "chore(persist): lint/format fixups for Phase 5

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (reconciled against the spec)

- **Seam #13 coverage:** on-disk `.garden` + autosave now persist `{ ...base, scene: SerializedScene }`; legacy garden-array files still load via the unchanged migration pipeline + `gardenToScene` (implicit through the legacy `Garden` return). ✅
- **One code path with undo:** new-format load reuses the same `loadState` mechanism Phase 4 introduced (here into a throwaway instance to reconstruct the `Garden`, keeping `deserializeGarden`'s `Garden` contract). ✅
- **Caller contract intact:** `deserializeGarden(): Garden` unchanged → App.tsx / store / autosave untouched. ✅
- **Legacy migrations preserved:** array-guarded field migrations run for both; `migrateLayoutsToCellGrid`/`snapPlantingsToCellGrid` stay legacy-only. Parity oracle `gardenFixtureRoundtrip.test.ts` (real legacy fixtures) untouched and green. ✅
- **Nested-frame losslessness:** new format stores parent-local poses (Phase 2); round-trip test asserts nested world-coord recomposition. ✅
- **Format detection:** `data.scene != null`; unambiguous (never a legacy `Garden` field). ✅
- **No store / canvas / kit changes:** fully contained in `src/utils/file.ts` + three test files. ✅
</content>
</invoke>
