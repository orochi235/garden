# Optimizer Auto-Clustering Design

**Status:** Draft for review
**Date:** 2026-05-05

## Goal

Make the raised-bed MILP optimizer tractable on inputs that exceed HiGHS-WASM's effective LP-size ceiling (empirically observed crashes at ~770 binary placement vars in the deployed environment, even with the footprint-aware pitch fix). Do this by automatically partitioning plants into clusters, allocating each cluster a sub-rectangle of the bed, and solving each cluster's MILP independently. Below the threshold, the existing single-LP path runs unchanged.

## Non-Goals

- User-painted hard regions (separate feature; soft `userRegions` continue working unchanged).
- Cross-cluster post-hoc optimization passes.
- Visible cluster boundaries on the canvas.
- Interior-trellis support beyond accepting the generalized `trellis` field shape.
- Parallel sub-bed solves.

## Architecture

The `solve()` function in `src/optimizer/worker.ts` gains a pre-solve pipeline that fires only when the unified LP would exceed a configurable size threshold. Otherwise the existing single-LP path runs unchanged.

Two pluggable seams, both internal to `src/optimizer/`:

```
OptimizationInput
  ↓
[Partitioner]              ← strategy: groups plants into clusters
  ↓
clusters: Cluster[]
  ↓
[Allocator]                ← strategy: assigns each cluster a sub-bed
  ↓
subBeds: { cluster, bed }[]
  ↓
[for each subBed: build & solve sub-MILP via existing path]
  ↓
combined OptimizationCandidate (placements re-translated to parent coords)
```

**Partitioner** signature:
```ts
type Partitioner = (input: OptimizationInput) => Cluster[];
interface Cluster {
  plants: OptimizerPlant[];
  climberCount: number;
}
```

**Allocator** signature:
```ts
type Allocator = (bed: OptimizerBed, clusters: Cluster[]) => SubBed[];
interface SubBed {
  cluster: Cluster;
  bed: OptimizerBed;     // sub-rectangle in parent-bed coordinates
  offsetIn: { x: number; y: number };  // for placement translation
}
```

v1 ships exactly one of each: `familyCompanionPartitioner` and `proportionalStripAllocator`. Both interfaces speak only types already in `src/optimizer/types.ts` (no project imports), preserving the package-extraction constraint.

## Trigger, Threshold, Failure Handling

**Trigger.** Before building the unified MILP, count the binary placement vars that *would* be created via a new pure helper `estimatePlacementVars(input)` in `formulation.ts`. If the total exceeds `MAX_UNIFIED_VARS = 500`, route through the cluster pipeline. Empirical: 770 vars crashed in production; 528 vars also crashed; 500 leaves headroom.

**Per-sub-bed failure.** Each sub-bed solve uses the existing `trySolve` + `buildMipModel` path. On crash, that cluster falls back to `greedyHexPack` (already plumbed with `spacingIn`). Other clusters are unaffected. The candidate's `reason` records which clusters used greedy.

**Whole-pipeline failure.** If the partitioner returns a single cluster, the allocator returns the whole bed and we solve the unified LP — exactly the existing path, no special-case code. If every sub-bed crashes, the candidate is built entirely from greedy fallbacks (same UX as today's solver-crash path).

**Cancellation.** The existing `isCancelled()` check fires before each sub-bed solve, not just before each candidate.

## Partitioner: Family + Companion-Bridge Merge

Location: `src/optimizer/partitioning/familyCompanion.ts`. Pure function.

**Step 1 — Family seed groups.** Bucket plants by `family`. Plants with unknown family form a singleton "other" group. Adds `family?: string` to `OptimizerPlant`; `runOptimizerForBed.ts` plumbs `cultivar.species.family` through. Field stays optional.

**Step 2 — Companion-bridge merge.** For each pair of family groups `(A, B)`:
```
bridgeStrength(A, B) = Σ over (a ∈ A, b ∈ B) of
  (count(a) × count(b)) × (companionWeight if companion, −antagonistWeight if antagonist, 0 otherwise)
```
If `bridgeStrength(A, B) ≥ MERGE_THRESHOLD` (v1: equivalent to one strong companion pair given default weights), merge. Iterate: pick the highest positive bridge strength, merge, recompute. Cap iterations at `groups.length − 1`.

**Step 3 — Climber tagging.** Each cluster records `climberCount = Σ p ∈ cluster of (climber ? count(p) : 0)`.

**Output ordering.** Clusters returned sorted by total footprint area descending. Deterministic, so "cluster once, perturb within sub-solves" produces comparable candidates.

## Allocator: Proportional Strip Slicing

Location: `src/optimizer/allocation/proportionalStrip.ts`. Pure function.

**Trellis location type.** New field replaces `trellisEdge`:
```ts
type TrellisLocation =
  | { kind: 'edge'; edge: 'N' | 'E' | 'S' | 'W' }
  | { kind: 'line'; orientation: 'horizontal' | 'vertical'; offsetIn: number };
```
v1 implements only `edge`. `line` is rejected with a clear error (added to TODO with the UI work needed). `runOptimizerForBed.ts` migrates the old `trellisEdge` shape at the boundary.

**Strip orientation.** Strips run *parallel* to the trellis line, or parallel to the bed's long axis when no trellis.

**Strip widths.** Each cluster claims `clusterFootprintArea / totalFootprintArea` of the cross-axis, where `clusterFootprintArea = Σ p ∈ cluster of count(p) × π × (footprintIn/2)²`. Minimum strip width = `2 × maxFootprintIn` in that cluster. If minimums sum to more than the cross-axis, allocator returns an error; caller treats it as a solver crash and falls through to greedy.

**Strip ordering.** Climber-containing clusters get the strip(s) adjacent to the trellis line (one such strip for an edge trellis). Within that constraint, strips order largest-first from the trellis side. With no trellis, largest-first from the bed origin.

**Sub-bed construction.** Each strip becomes an `OptimizerBed` with its own `widthIn`, `lengthIn`, inherited `edgeClearanceIn`, and `trellis` only on the strip adjacent to the parent's trellis line. `userRegions` are intersected with each sub-bed and translated to sub-bed-local coordinates; out-of-strip regions are dropped.

## Solver Integration

`worker.ts` `solve()` body becomes:
```ts
for (let n = 0; n < input.candidateCount; n++) {
  if (isCancelled()) break;
  const weights = n === 0 ? input.weights : perturbWeights(input.weights, 0.05, 1000 + n);
  const workingInput = { ...input, weights };

  const candidate = estimatePlacementVars(workingInput) > MAX_UNIFIED_VARS
    ? await solveClustered(workingInput, n, ...)
    : await solveUnified(workingInput, n, ...);

  if (candidate) candidates.push(candidate);
}
```

`solveUnified` is the current single-LP path extracted as a function (returns `OptimizationCandidate | null`).

`solveClustered`:
1. `clusters = familyCompanionPartitioner(workingInput)`
2. `subBeds = proportionalStripAllocator(workingInput.bed, clusters)`
3. For each `(cluster, subBed)` sequentially: build a `subInput` with `plants = cluster.plants`, `bed = subBed.bed`, `userRegions` clipped, then call `solveUnified(subInput, n, ...)`. On `null`, run `greedyFallbackFor(subInput)`.
4. Translate every sub-bed placement back to parent-bed coordinates using the strip offset.
5. Assemble combined candidate: placements concatenated, `score` summed, `gap` = max sub-bed gap (most pessimistic), `solveMs` summed, `reason` = aggregated cluster summary with greedy-fallback notes.

**Diversity / no-good cuts.** `priorActive` becomes `Record<clusterKey, string[]>`. Candidate `n+1`'s sub-bed for each cluster gets a no-good cut against candidate `n`'s active vars in that cluster. Cluster keys are the deterministic cluster ordering produced by the partitioner.

**Diagnostic logging.** Per-sub-bed: `[optimizer] candidate N cluster <key> vars: ... aux: ... constraints: ... lpBytes: ...`.

## UX & Defaults

- No new UI. Clusters are solver-internal; users see a layout, not a partitioning.
- The candidate `reason` string includes cluster summary as flavor text: `"12 plants placed across 3 groups (nightshades, brassicas, herbs)"`.
- No new user-facing settings. `MAX_UNIFIED_VARS` and `MERGE_THRESHOLD` are constants in source; tuning is a code change.

## Tests

- `partitioning/familyCompanion.test.ts`: family-only grouping; companion pair triggers merge; antagonist prevents merge that family alone wouldn't have caused (no-op); chained merges (A↔B and B↔C produce one cluster); deterministic ordering across identical inputs.
- `allocation/proportionalStrip.test.ts`: two clusters with no trellis; one climber cluster with edge trellis claims the trellis-adjacent strip; minimum-width clamp; region intersection across strips; refusal of `trellis: line`.
- `clustered.test.ts` (or worker test): unified path runs unchanged below threshold; clustered path runs above threshold; combined placements are in parent coords; sub-bed greedy fallback flows through; per-cluster no-good cuts produce diversity within each cluster.
- Existing `eightTomatoRegression.test.ts` continues to verify the unified-path topology.

## Deferred (TODO entries)

- Visualize cluster regions on the canvas (overlay shading per group), gated on user opt-in to define regions
- Post-hoc cluster rotation/swap pass for cross-cluster companion bonuses
- Greedy fallback that respects existing intentional placements
- Interior trellises (`trellis: { kind: 'line', ... }`): UI for placement, allocator for dual-side strip layout
- Adaptive partitioner selection based on input shape (homogeneous bypass, paired-mirror, diversity-spread)
- Adaptive allocator selection (guillotine, bin-packing)
- Parallel sub-bed solves (multiple workers)
- Cross-cluster score reported as a candidate-comparison stat
