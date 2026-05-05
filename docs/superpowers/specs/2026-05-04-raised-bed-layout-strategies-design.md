# Raised-Bed Layout Strategies — Design

## Summary

Add five new arrangement strategies tailored to raised-bed gardening on top of the existing `Arrangement` model (`rows | grid | ring | single | free`), introduce **multi-strategy beds** (regions within a single bed each running their own strategy), drive spacing from cultivar metadata where available, and add an **optimizer mode** that takes a list of plants plus a bed and produces 1–3 ranked layouts via mixed-integer linear programming (MILP).

These extend `src/model/arrangement.ts` and `src/canvas/adapters/plantingLayout.ts`. The optimizer is a new module that consumes the existing model and emits the same `Arrangement` shape (typically as a `multi` strategy with sub-regions).

## Goals

1. Cover the layout idioms gardeners actually use in raised beds.
2. Let one bed mix idioms — herbs in one corner, tomatoes-with-basil in another, dense carrot rows along the back.
3. Use cultivar metadata (footprint, height, climbing flag, companion lists) to set sensible defaults instead of asking the user for every spacing value.
4. Provide a one-click "optimize this bed for the plants I want to grow" experience that yields real, mathematically-derived placements — not a heuristic — using a JS-friendly MILP solver running in a Web Worker.

## Non-Goals (v1)

- Symmetry / aesthetic objective terms — too hard to linearize cleanly for the value delivered.
- Solver UI for picking one specific solver out of several. We commit to `highs-js`.
- Live re-optimization while the user drags plants. The optimizer is invoked explicitly.
- Crop rotation / multi-season planning. Single-season layouts only.
- Optimizer support for non-rectangular bed shapes. Circular and rectangle beds for v1; rectangle is the focus.
- Auto-migration of existing beds onto `multi`. Existing `rows / grid / ring / single / free` arrangements continue to work as-is and stay on their current variant. `multi` is opt-in.

## Architecture Overview

```
src/
  model/
    arrangement.ts             extend ArrangementType union; add new configs
    arrangementStrategies/     one file per new strategy (computeSlots impls)
      squareFoot.ts
      hex.ts
      trellisedBack.ts
      bandedRows.ts
      multi.ts                 multi-region bed — composes other strategies
    cultivarSpacing.ts         derive default spacings from cultivar metadata
  canvas/
    adapters/
      plantingLayout.ts        already wires Arrangement → DropTarget; extend
  optimizer/
    types.ts                   OptimizationInput / OptimizationResult
    formulation.ts             builds the MILP from criteria + plant list
    weights.ts                 weight defaults + normalization helpers
    diversity.ts               no-good cuts + optional perturbation
    seed.ts                    greedy hex-pack heuristic for warm-start
    worker.ts                  Web Worker entry — wraps highs-js
    runOptimizer.ts            main-thread API; posts work to worker
  components/
    sidebar/
      OptimizePanel.tsx        live-tuning sidebar surface
    optimizer/
      OptimizerWizard.tsx      modal candidate-compare surface
```

## Component Designs

### 1. Five new arrangement strategies

Each is a new variant of the `Arrangement` discriminated union, with its own config shape and a `computeSlots(arrangement, bounds, cultivars?)` implementation. The strategies are independent units; consumers go through `computeSlots` and never see the variant internals.

**Square-foot.** Bed is partitioned into 1ft (configurable) cells. Each cell holds N plants depending on cultivar — default lookup table (1, 4, 9, 16) keyed off the cultivar's footprint radius. Config: `{ type: 'square-foot', cellSizeFt: number }`.

**Hex (staggered).** Equilateral packing. Pitch is taken from cultivar footprint by default; user can override with an explicit pitch. Even rows offset by half-pitch. Config: `{ type: 'hex', pitchFt: number | 'auto', marginFt: number }`.

**Trellised back-row.** Bed gains a `trellisEdge: 'N' | 'E' | 'S' | 'W' | null`. Climber-flagged cultivars get a back-edge band; remaining children flow as configurable rows in front (tall → short stepping toward the front). Config: `{ type: 'trellised-back', trellisEdge: Edge, frontStrategy: ArrangementType }`.

**Banded rows.** Like `rows`, but each row has its own pitch derived from the cultivar that occupies it. When the row's plants are heterogeneous, fall back to an explicit `bandPitchFt` array. Config: `{ type: 'banded-rows', bands: BandConfig[] }`.

**Multi (companion blocks / multi-strategy beds).** The bed is partitioned into N rectangular sub-regions, each with its own child `Arrangement`. Sub-regions are stored in bed-local coordinates as `(x, y, w, h)` rectangles, normalized so resizing the bed reflows the regions proportionally. Config: `{ type: 'multi', regions: { bounds: NormalizedRect, arrangement: Arrangement }[] }`.

`computeSlots` for `multi` recursively computes slots inside each sub-region's rect (clipped to its `getPlantableBounds`-equivalent) and concatenates with a `regionId` tag so the planting layout adapter can route drops to the right region.

### 2. Cultivar-driven spacing

New module `src/model/cultivarSpacing.ts` exports:

- `defaultPitchFor(cultivar): number` — from `cultivar.footprintFt × 2` if present, else a per-category fallback (root crop / leafy / fruiting / climbing).
- `squareFootCountFor(cultivar): 1 | 4 | 9 | 16` — bucketed from footprint.
- `defaultClearanceFor(cultivar): number` — bed-edge clearance.
- `companions(a, b): 'companion' | 'antagonist' | null` — lookup against a static table; missing pair → `null` (term contributes 0 in the optimizer).

Strategies that take `pitchFt: 'auto'` resolve through this module at `computeSlots` time. The model never embeds cultivar references; `computeSlots` accepts an optional `cultivars` arg and uses defaults when omitted.

### 3. Optimizer mode

Solves a placement problem given a bed and a list of plants. Built around `highs-js` (chosen for being the strongest open-source MIP solver with a working WASM build).

**Input** (`OptimizationInput`):
- `bed`: `{ widthIn, heightIn, trellisEdge, edgeClearanceIn }`
- `plants`: `{ cultivarId, count, footprintIn, heightIn, climber }[]`
- `weights`: per-criterion weights with sensible defaults
- `gridResolutionIn`: cell size for discretization (default 4 in)
- `userRegions`: optional list of `(rect, preferredCultivarIds[])` for criterion #8

**Decision variables.** `x[k, i, j] ∈ {0, 1}` = "plant `k` placed with footprint origin at cell `(i, j)`". Cells outside the bed (after edge clearance) are pruned at formulation time, not added to the model.

**Hard constraints:**

| # | Name | Form |
|---|------|------|
| 1 | Footprint non-overlap | `Σ x[k,i,j]` over all `(k, i, j)` whose footprint covers cell `(c_x, c_y)` ≤ 1, for every bed cell |
| 2 | Bed-edge clearance | `x[k, i, j] = 0` for any `(i, j)` where the footprint would extend past `bed_bounds shrunk by clearance[k]` |
| (placement) | Each plant placed exactly once | `Σ_{i,j} x[k,i,j] = 1` for every `k` |

**Soft objective terms** — each weighted, each contributes 0 when the underlying data is missing:

| # | Name | Mechanism |
|---|------|-----------|
| 3 | Sun shading | Per-pair aux var `s[a, b]` = "is `a` south of `b`?" tied to `x` by linear inequalities. Penalty `w₃ × (heightDiff)` per pair where taller is south of shorter. |
| 4 | Companion bonuses | Per-pair aux var `n[a, b]` = "are `a` and `b` within distance `d`?". `+w₄` per companion pair set. |
| 5 | Antagonist penalties | Same `n[a, b]`, sign flipped, antagonist table. |
| 6 | Same-species buffer | Like #1 but with a per-cultivar `bufferRadius` for same-cultivar pairs. Soft per user — penalizes violations rather than forbidding them. |
| 7 | Trellis-edge attraction | For climber `k`, `+w₇ × (max - distFromTrellisEdge[i, j])` baked into the per-cell coefficient of `x[k, i, j]`. |
| 8 | Sub-region preferences | For each `(rect, preferredIds)`, `+w₈` per `x[k, i, j]` whose `k` is preferred and whose `(i, j)` lies in `rect`. |

**Skipped:** symmetry / aesthetic — not linearizable cleanly enough.

Each term is normalized to roughly `[0, 1]` per pair / plant before weighting so users can reason about weights independently.

**Diversity.** Iterative re-solve with no-good cuts:
1. Solve → layout A.
2. Add constraint `Σ_{k, (i, j) ∈ A} x[k, i, j] ≤ N − k_diff` where `k_diff` is the minimum-difference threshold (user-tunable "diversity" slider, default 3).
3. Re-solve → layout B. Repeat for C.

Each re-solve uses HiGHS warm-start from the prior solution. Optionally, the second and third runs apply a small random perturbation (`±5%`) to objective coefficients to spread results further.

### 4. Performance discipline

The model is engineered for size before relying on the solver. In priority order:

1. **Coarse grid** — default 4-inch cells (configurable). 1-inch resolution would be ~16× larger; gardeners place seedlings to inches in practice anyway.
2. **Symmetry breaking** — interchangeable plants of the same cultivar are constrained to a lex order on cell index. Removes `n!` permutational duplicates per same-cultivar group.
3. **Cell-coverage non-overlap** — `O(cells)` constraints, not `O(plants²)`. Better than pairwise at our scale.
4. **Warm starts on re-solve** — each diversity iteration starts from the last incumbent.
5. **Gap tolerance** — solver stops at 1% optimality gap by default, not provable optimum.
6. **Heuristic seeding** — a greedy hex-pack provides an initial feasible incumbent so the solver has a lower bound to beat from the start.

### 5. Runtime budget

- **Per-solve time limit:** 5 seconds default, exposed as a slider in advanced settings only.
- **Gap tolerance:** 1% default.
- **Threading:** all solves run in a Web Worker. Main thread shows progress + Cancel.
- **Diversity-loop budget:** per-solve (each candidate gets the full 5s). Warm starts make re-solves cheaper than the initial run in practice.

### 6. UI surfaces

Two complementary surfaces, both wrapping the same `runOptimizer` API.

**Sidebar panel (`OptimizePanel`).** Appears in the right sidebar when a raised bed is selected. Shows the inferred plant list, weight sliders for each criterion, diversity slider, and a "Solve" button. Live ghost-preview of the currently-selected candidate is drawn into the bed in canvas. Tiny thumbnails (1, 2, 3) let the user switch which candidate is previewed. "Apply" commits the selected candidate as a single undoable action.

**Modal wizard (`OptimizerWizard`).** Triggered from a context-menu / button on the bed, or from a sidebar overflow. Opens full-screen, shows all 3 candidates side-by-side as larger cards with scores and short reason labels. User picks one to apply, or cancels. Better fit when the user is doing a one-shot batch.

Both surfaces are thin React over the worker API; neither owns optimization state.

## Data flow

```
User clicks Solve in OptimizePanel
  → OptimizePanel collects (bed, plants, weights, diversity) from gardenStore + uiStore
  → runOptimizer.run({ ... }) posts to Web Worker
  → worker.ts:
      formulation.build(input)           # build matrix, prune, symmetry-break
      seed.greedyHexPack(input)          # initial incumbent
      highs.solve(model, { timeLimit: 5, mipGap: 0.01, warmStart: seed })
      diversity.next(prior, k_diff)      # add no-good cut
      [repeat for B, C]
  → worker posts back { candidates: [layoutA, layoutB, layoutC], scores, reasons }
  → uiStore.setOptimizerResult(...)
  → OptimizePanel re-renders with thumbnails; ghost-preview layer reads selected candidate
  → user clicks Apply → gardenStore.applyOptimizerResult() in one undoable batch
```

The output of the optimizer is a `multi` arrangement with regions corresponding to the discovered grouping, plus explicit plant placements within each region. Existing arrangement consumers don't need to change.

## Testing

- **Unit:** each new `computeSlots` impl, `cultivarSpacing` resolvers, formulation builder (exact constraint-count assertions), diversity cut generation.
- **Integration:** end-to-end optimizer run on a fixed seed (deterministic with no perturbation) for a known input, asserting the placement matrix and the score.
- **Performance smoke:** solve a 4×8 ft bed with 30 plants under 8s on CI hardware. Failing this test means the formulation regressed; doesn't necessarily fail on user hardware.
- **Multi-strategy:** round-trip a `multi` arrangement through serialization and arrangement → drop-target → drop pipeline.

## Risks and open questions

- **`highs-js` bundle size (~1MB).** Dynamically import the optimizer module so beds users never optimize don't pay the cost.
- **Worker cold start.** First-solve latency includes WASM compile (~200ms). Pre-warm on optimizer panel mount.
- **Companion / antagonist data.** No table exists yet. v1 ships with a small curated seed table (~30 well-known pairs) and the term degrades to 0 for unknown pairs.
- **Multi-strategy bed serialization.** Existing gardens with non-`multi` arrangements stay valid. Migrations: none required; `multi` is an additive variant.

## Deferrals

The following are explicitly out of scope for v1 and tracked in `docs/TODO.md`:

- Symmetry / aesthetic objective terms.
- Live re-optimization during drag.
- Crop rotation / multi-season optimization.
- Non-rectangular bed shapes in the optimizer.
- A user-facing solver picker (we commit to `highs-js`).
- Building out the full companion / antagonist database — v1 ships a small seed table.
