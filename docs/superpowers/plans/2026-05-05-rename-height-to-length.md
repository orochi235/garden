# Rename 2D `height` → `length` for spatial footprints

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Rename horizontal-plane Y-dimension fields from `height` → `length` (and `heightFt` → `lengthFt`) across `Structure`, `Zone`, `Garden`, `Blueprint`, optimizer inputs, canvas layers, and persisted garden JSON. "Height" implies vertical/soil-depth and is misleading for footprint extents. Plant vertical heights (`Cultivar.heightFt`, plant `heightIn`) STAY — they really are vertical.

**Architecture:** Mechanical rename. Single conceptual change applied uniformly. Persisted garden JSON gets a one-shot migration in the load path (bump a schema version OR detect old field). Tests update alongside production code.

**Tech Stack:** TypeScript, Vitest, Zustand store, IndexedDB persistence (via `src/utils/file.ts` and store).

---

## Scope

**RENAME** these fields (and all references):

- `Structure.height` → `Structure.length`
- `Zone.height` → `Zone.length`
- `Garden.heightFt` → `Garden.lengthFt`
- `Blueprint` — check whether it has a height; if it's image height, leave it (TBD per Task 1)
- `OptimizationInput.bed.heightIn` → `OptimizationInput.bed.lengthIn`
- Any helper/option/param field named `height` / `heightFt` / `heightIn` referring to the 2D footprint Y-extent (e.g., `getPlantableBounds`, `createStructure`, `createZone`, `createGarden`, drag/move adapters, layer renderers)

**DO NOT RENAME**:

- `Cultivar.heightFt` (real plant height)
- `Plant.heightIn` (real plant height) in optimizer types
- Canvas/CSS pixel heights (DOM, SVG element heights, viewport, computed style)
- Image natural height fields
- Anything labeled clearly as a vertical dimension

**Migration:** Existing persisted gardens have `heightFt`, structures have `height`, zones have `height`. Add a one-shot upgrade in the load path that copies `height`→`length` (and `heightFt`→`lengthFt`) when the old field is present and the new one is missing. Bump `Garden.version`.

---

### Task 1: Audit & boundary list

**Files:**
- Read: all matches of `\bheight(Ft|In)?\b` in `src/`

- [ ] Run `grep -rn "heightFt\|heightIn\|\.height\b\|\bheight:" src/` and produce a categorized list:
  - **Rename** (2D footprint): structure/zone/garden/optimizer-bed dimensions
  - **Keep** (vertical): cultivar/plant heights, image natural height, DOM/SVG pixel heights
  - **Ambiguous** (flag for review)
- [ ] Save categorization as a comment block at top of this plan or as `/tmp/height-rename-audit.txt`. Do NOT edit production code in this task.
- [ ] Commit: none (audit only).

### Task 2: Core model types + factories

**Files:**
- Modify: `src/model/types.ts`
- Modify: `src/model/types.test.ts`

- [ ] Update `Structure.height` → `length`, `Zone.height` → `length`, `Garden.heightFt` → `lengthFt`.
- [ ] Update `createStructure`, `createZone`, `createGarden`, `getPlantableBounds` parameter types and bodies.
- [ ] Update `src/model/types.test.ts` — rename in test fixtures & assertions.
- [ ] Run `npx vitest run src/model/types.test.ts` — expect pass.
- [ ] Commit: `refactor(model): rename 2D height→length on Structure/Zone/Garden`

### Task 3: Persistence migration

**Files:**
- Modify: `src/utils/file.ts` (and/or wherever garden load/parse happens)
- Modify: `src/utils/file.test.ts`
- Modify: `src/store/gardenStore.ts` (load/hydrate path)

- [ ] Add migration: when loading a Garden JSON, if `heightFt` present and `lengthFt` absent, set `lengthFt = heightFt` and delete `heightFt`. Same for each Structure (`height`→`length`) and Zone (`height`→`length`). Bump `version` to current+1.
- [ ] Add a vitest test: load a fixture with old field names → assert new fields populated and old gone.
- [ ] Run the test — expect pass.
- [ ] Commit: `feat(persistence): migrate height→length on garden load`

### Task 4: Optimizer types + formulation

**Files:**
- Modify: `src/optimizer/types.ts` (`bed.heightIn` → `bed.lengthIn`)
- Modify: `src/optimizer/formulation.ts`
- Modify: `src/optimizer/seed.ts`
- Modify: `src/optimizer/formulation.test.ts`, `src/optimizer/seed.test.ts`, `src/optimizer/runOptimizer.test.ts`, `src/optimizer/perf.test.ts`, `src/optimizer/repro8tom.test.ts`
- Modify: `src/components/optimizer/runOptimizerForBed.ts` and its test

- [ ] Rename `bed.heightIn` → `bed.lengthIn` in `OptimizationInput`. Keep plant `heightIn` UNCHANGED.
- [ ] Update all consumers in optimizer code & tests.
- [ ] In `runOptimizerForBed.ts`, source the bed length from `Structure.length` (post-rename) and feed `lengthIn`.
- [ ] Run `npx vitest run src/optimizer/ src/components/optimizer/` — expect pass.
- [ ] Commit: `refactor(optimizer): rename bed.heightIn→lengthIn`

### Task 5: Canvas layers, drag, adapters

**Files:**
- Modify: `src/canvas/**/*.ts(x)` matches from Task 1's "rename" list
- Modify: corresponding tests

- [ ] Apply renames per audit. Pay attention to `useEricSelectTool.test.ts`, `structureMoveBehaviors.ts`, `trayLayersWorld.ts`, `selectionLayersWorld.test.ts`, `seedFillTrayDrag.ts`, `plantingLayout.test.ts`, `structureMove.ts`, `zoneMove.ts`, `seedStartingScene.ts`, `debugLayers.ts`, `CanvasNewPrototype.tsx`, `SeedStartingCanvasNewPrototype.tsx`.
- [ ] For each file, also rename local variables/params if they clearly refer to the 2D Y-extent (judgment: variable derived from `structure.height` becomes `length`).
- [ ] Run full test suite after — expect pass.
- [ ] Commit: `refactor(canvas): rename 2D height→length`

### Task 6: Sidebar, hooks, actions, store, remaining UI

**Files:**
- Modify: `src/components/**/*.tsx`, `src/hooks/**`, `src/actions/**`, `src/store/**`
- Modify: corresponding tests

- [ ] Apply renames. Special attention: `LayerPropertiesPanel.tsx` (probably has `height` form input — re-label "Length" in UI copy where appropriate, but UI label changes should match the field semantics).
- [ ] `gardenStore.ts`, `gardenStore.test.ts`, `history.test.ts`, `resetView.ts`, `useGardenOffscreen.ts`, `ReturnToGarden.tsx`.
- [ ] Run full test suite — expect pass.
- [ ] Commit: `refactor(ui): rename 2D height→length in components/store/actions`

### Task 7: UI labels + final sweep

**Files:**
- Any user-facing strings that say "Height" referring to a 2D footprint — change to "Length"

- [ ] Grep for `"Height"`, `'Height'`, `>Height<` in `src/` and update labels for structures/zones/garden. Leave plant-height labels alone.
- [ ] Run `npm run build` (typecheck + bundle) — expect success.
- [ ] Run `npm test` — full pass.
- [ ] Commit: `refactor(ui): update 2D height labels to length`

### Task 8: Verification

- [ ] Manually load an existing persisted garden in dev and confirm migration applies.
- [ ] Confirm dimensions still display correctly.
- [ ] Update `docs/behavior.md` if any documented behavior phrasing referenced height/width for footprints.

---

## Notes for implementer subagents

- **Be conservative on "ambiguous" matches.** When unsure if a `.height` is 2D footprint vs vertical, check what type the variable is. If it's typed `Structure | Zone | Garden | Bed`, rename. If it's `Cultivar | Plant | HTMLElement | SVGRect | viewport`, do NOT rename.
- **Tests are part of the task.** Don't defer test updates.
- **Commit frequently** — one commit per task minimum.
- **TODO file:** No deferrals expected. If you defer anything, append to `docs/TODO.md`.
