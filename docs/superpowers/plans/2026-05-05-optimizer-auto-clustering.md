# Optimizer Auto-Clustering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the raised-bed MILP optimizer tractable on inputs that exceed HiGHS-WASM's effective LP-size ceiling by partitioning plants into clusters and solving each cluster's MILP in its own sub-bed.

**Architecture:** Two pluggable seams inside `src/optimizer/` — a `Partitioner` that groups plants into clusters by `category` with companion-bridge merging, and an `Allocator` that assigns each cluster a proportional strip of the parent bed. The existing single-LP path runs unchanged below a configurable size threshold; above the threshold the clustered pipeline runs each sub-bed through the same `buildMipModel`+`trySolve` path. Sub-bed crashes fall back to greedy hex pack per-cluster.

**Tech Stack:** TypeScript, Vitest, Web Worker, highs-js (HiGHS-WASM). Pure-functional code where possible. Spec at `docs/superpowers/specs/2026-05-05-optimizer-auto-clustering-design.md`.

**Package-extraction constraint:** All code in `src/optimizer/**` MUST NOT import anything from outside `src/optimizer/`. Public API in `src/optimizer/types.ts` MUST NOT contain project types — only plain JS types and types defined in `types.ts` itself. Caller-side adaptation (translating project types to optimizer types) lives in `src/components/optimizer/runOptimizerForBed.ts`.

**Spec deviation:** The spec uses the word "family" for the partition key. The implementation uses the existing `category` field (`CultivarCategory`) on cultivars/species — same concept, naming aligned to existing data. References to "family" in the spec map to "category" throughout the plan.

---

## File Structure

**New files:**
- `src/optimizer/partitioning/familyCompanion.ts` — partitioner implementation
- `src/optimizer/partitioning/familyCompanion.test.ts` — partitioner tests
- `src/optimizer/allocation/proportionalStrip.ts` — allocator implementation
- `src/optimizer/allocation/proportionalStrip.test.ts` — allocator tests
- `src/optimizer/clustered.test.ts` — end-to-end test for the clustered pipeline

**Modified files:**
- `src/optimizer/types.ts` — replace `trellisEdge: Edge | null` with `trellis: TrellisLocation | null`; add `category?: string` to `OptimizerPlant`; add `Cluster` and `SubBed` types
- `src/optimizer/formulation.ts` — read `bed.trellis` instead of `bed.trellisEdge`; add `estimatePlacementVars` exported helper
- `src/optimizer/seed.ts` — read `bed.trellis` instead of `bed.trellisEdge` (only if it does — check)
- `src/optimizer/worker.ts` — extract `solveUnified`; add `solveClustered`; threshold-gated dispatch in `solve`; per-cluster `priorActive`; coordinate translation; updated `reasonLabel`
- `src/optimizer/eightTomatoRegression.test.ts` — update to new `trellis` shape
- `src/optimizer/runOptimizer.test.ts` — update to new `trellis` shape
- `src/optimizer/formulation.test.ts` — update to new `trellis` shape
- `src/optimizer/seed.test.ts` — update to new `trellis` shape
- `src/optimizer/perf.test.ts` — update to new `trellis` shape
- `src/components/optimizer/runOptimizerForBed.ts` — plumb `cultivar.category` to `plants[].category`; build `trellis` from project's `bed.trellisEdge`
- `src/components/optimizer/runOptimizerForBed.test.ts` — update assertion to expect `trellis: { kind: 'edge', edge: 'N' }`
- `docs/TODO.md` — append deferred enhancement entries

---

## Task 1: Generalized trellis location type and category field

**Files:**
- Modify: `src/optimizer/types.ts`

- [ ] **Step 1: Replace `trellisEdge` with `trellis: TrellisLocation | null` in `OptimizerBed`; add `category?: string` to `OptimizerPlant`.**

In `src/optimizer/types.ts`, replace the existing `OptimizerBed` and the `OptimizerPlant` definitions to look like this:

```ts
export type Edge = 'N' | 'E' | 'S' | 'W';

export type TrellisLocation =
  | { kind: 'edge'; edge: Edge }
  | { kind: 'line'; orientation: 'horizontal' | 'vertical'; offsetIn: number };

export interface OptimizerBed {
  /** Bed width along the X axis, in inches. */
  widthIn: number;
  /** Bed length along the Y axis, in inches. */
  lengthIn: number;
  /** Trellis location, or null if no trellis. */
  trellis: TrellisLocation | null;
  /** Per-edge clearance, inches. Default 0. */
  edgeClearanceIn: number;
}

export interface OptimizerPlant {
  /** Stable id; the optimizer treats each `count` copy as interchangeable. */
  cultivarId: string;
  /** How many of this plant the user wants to fit. */
  count: number;
  /** Footprint diameter in inches (visual size at maturity). */
  footprintIn: number;
  /** Recommended center-to-center spacing in inches. Falls back to footprintIn. */
  spacingIn?: number;
  /** Mature height in inches. Used by the sun-shading term. */
  heightIn: number | null;
  /** True if the plant prefers a trellis edge. */
  climber: boolean;
  /** Plant category for clustering (e.g. 'vegetables', 'herbs'). Optional. */
  category?: string;
}
```

Add new `Cluster` and `SubBed` types at the end of the file, before `DEFAULT_WEIGHTS`:

```ts
export interface Cluster {
  /** Plants assigned to this cluster. */
  plants: OptimizerPlant[];
  /** Total number of climber-flagged plant copies (sum of count where climber=true). */
  climberCount: number;
  /** Stable identifier for the cluster, used for diagnostic logging and per-cluster no-good cuts. */
  key: string;
}

export interface SubBed {
  cluster: Cluster;
  /** Sub-rectangle as a self-contained OptimizerBed. */
  bed: OptimizerBed;
  /** Offset of this sub-bed's origin within the parent bed, inches. */
  offsetIn: { x: number; y: number };
}
```

- [ ] **Step 2: Run typecheck to see all callers that broke.**

Run: `npx tsc -b 2>&1 | head -50`
Expected: errors at all call sites that read `bed.trellisEdge` or construct beds with `trellisEdge`. Note them — they are fixed in the next task.

- [ ] **Step 3: Commit the type change.**

```bash
git add src/optimizer/types.ts
git commit -m "feat(optimizer): generalize trellis location, add category and cluster types"
```

---

## Task 2: Migrate internal optimizer code to the new trellis shape

**Files:**
- Modify: `src/optimizer/formulation.ts`
- Modify: `src/optimizer/worker.ts`
- Modify: `src/optimizer/eightTomatoRegression.test.ts`
- Modify: `src/optimizer/runOptimizer.test.ts`
- Modify: `src/optimizer/formulation.test.ts`
- Modify: `src/optimizer/seed.test.ts`
- Modify: `src/optimizer/perf.test.ts`

- [ ] **Step 1: Update `formulation.ts` to read `bed.trellis`.**

In `src/optimizer/formulation.ts`, find the `perCellCoeff` function and update the climber clause:

```ts
function perCellCoeff(
  p: MipModel['plants'][number],
  cell: { xCenterIn: number; yCenterIn: number },
  input: OptimizationInput,
): number {
  let c = 0;
  // Trellis attraction: closer to the trellis edge → higher coefficient
  if (p.climber && input.bed.trellis && input.bed.trellis.kind === 'edge') {
    const distFromEdge = distanceToEdge(cell, input.bed.trellis.edge, input.bed);
    const maxDist = Math.max(input.bed.widthIn, input.bed.lengthIn);
    c += input.weights.trellisAttraction * (1 - distFromEdge / maxDist);
  }
  // Region preference
  for (const region of input.userRegions) {
    if (region.preferredCultivarIds.includes(p.cultivarId) && pointInRegion(cell, region)) {
      c += input.weights.regionPreference;
    }
  }
  return c;
}
```

Replace the existing `distanceToEdge` function with a version that takes the edge directly:

```ts
function distanceToEdge(
  cell: { xCenterIn: number; yCenterIn: number },
  edge: 'N' | 'E' | 'S' | 'W',
  bed: { widthIn: number; lengthIn: number },
): number {
  switch (edge) {
    case 'N': return cell.yCenterIn;
    case 'S': return bed.lengthIn - cell.yCenterIn;
    case 'W': return cell.xCenterIn;
    case 'E': return bed.widthIn - cell.xCenterIn;
  }
}
```

- [ ] **Step 2: Update `worker.ts` `reasonLabel` to read the new shape.**

In `src/optimizer/worker.ts`, change the `reasonLabel` function:

```ts
function reasonLabel(input: OptimizationInput, placements: OptimizerPlacement[]): string {
  const parts: string[] = [];
  if (placements.length === 0) return 'no placements found';
  parts.push(`${placements.length} plants placed`);
  if (input.bed.trellis && input.bed.trellis.kind === 'edge') {
    parts.push(`trellis ${input.bed.trellis.edge}`);
  }
  const companionPairs = Object.values(input.companions.pairs).filter((r) => r === 'companion').length;
  if (companionPairs > 0) parts.push(`${companionPairs} companion pairs`);
  return parts.join(', ');
}
```

- [ ] **Step 3: Update every test file to construct beds with the new `trellis` shape.**

In each test file, find the bed literal and update:
- `trellisEdge: null` → `trellis: null`
- `trellisEdge: 'N'` (or any edge) → `trellis: { kind: 'edge', edge: 'N' }`

Files: `src/optimizer/eightTomatoRegression.test.ts` (2 occurrences), `src/optimizer/runOptimizer.test.ts` (1), `src/optimizer/formulation.test.ts` (1), `src/optimizer/seed.test.ts` (1), `src/optimizer/perf.test.ts` (1, with edge 'N').

- [ ] **Step 4: Run optimizer tests to verify the migration.**

Run: `npx vitest run src/optimizer/`
Expected: all 18 tests pass (1 skipped).

- [ ] **Step 5: Commit.**

```bash
git add src/optimizer/
git commit -m "refactor(optimizer): adopt generalized trellis location internally"
```

---

## Task 3: Migrate caller (runOptimizerForBed) to the new trellis shape and plumb category

**Files:**
- Modify: `src/components/optimizer/runOptimizerForBed.ts`
- Modify: `src/components/optimizer/runOptimizerForBed.test.ts`

- [ ] **Step 1: Update `runOptimizerForBed.ts` to construct the new `trellis` field and plumb `cultivar.category`.**

In `src/components/optimizer/runOptimizerForBed.ts`, change the body of `runOptimizerForBed`:

```ts
export function runOptimizerForBed(args: BedOptimizerArgs): RunHandle {
  const FT_TO_IN = 12;
  const plants: OptimizerPlant[] = args.request.map(({ cultivar, count }) => ({
    cultivarId: cultivar.id,
    count,
    footprintIn: cultivar.footprintFt * FT_TO_IN,
    spacingIn: cultivar.spacingFt * FT_TO_IN,
    heightIn: cultivar.heightFt != null ? cultivar.heightFt * FT_TO_IN : null,
    climber: cultivar.climber,
    category: cultivar.category,
  }));

  const companions: CompanionTable = { pairs: buildCompanionTable(args.request.map((r) => r.cultivar)) };

  const input: OptimizationInput = {
    bed: {
      widthIn: args.bed.width * FT_TO_IN,
      lengthIn: args.bed.length * FT_TO_IN,
      trellis: args.bed.trellisEdge ? { kind: 'edge', edge: args.bed.trellisEdge } : null,
      edgeClearanceIn: 0,
    },
    plants,
    weights: DEFAULT_WEIGHTS,
    gridResolutionIn: 4,
    companions,
    userRegions: [],
    timeLimitSec: args.timeLimitSec ?? 5,
    mipGap: 0.01,
    candidateCount: args.candidateCount ?? 3,
    diversityThreshold: args.diversityThreshold ?? 3,
  };

  return runOptimizer(input, { onProgress: args.onProgress });
}
```

- [ ] **Step 2: Update `runOptimizerForBed.test.ts` to expect the new bed shape.**

In `src/components/optimizer/runOptimizerForBed.test.ts`, find the assertion `expect(call[0].bed.trellisEdge).toBe('N')` and replace with:

```ts
expect(call[0].bed.trellis).toEqual({ kind: 'edge', edge: 'N' });
```

- [ ] **Step 3: Run the caller's tests.**

Run: `npx vitest run src/components/optimizer/`
Expected: all tests pass.

- [ ] **Step 4: Run a full typecheck and full test sweep.**

Run: `npm run build`
Expected: build succeeds, no type errors.

Run: `npx vitest run`
Expected: all tests pass (no regression).

- [ ] **Step 5: Commit.**

```bash
git add src/components/optimizer/
git commit -m "refactor(optimizer): plumb cultivar.category and new trellis shape from caller"
```

---

## Task 4: estimatePlacementVars helper

**Files:**
- Modify: `src/optimizer/formulation.ts`
- Modify: `src/optimizer/formulation.test.ts`

- [ ] **Step 1: Write a failing test for `estimatePlacementVars`.**

In `src/optimizer/formulation.test.ts`, add:

```ts
import { estimatePlacementVars } from './formulation';

describe('estimatePlacementVars', () => {
  it('matches the actual model var count', () => {
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 },
      plants: [
        { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, climber: false },
        { cultivarId: 'basil', count: 6, footprintIn: 6, heightIn: null, climber: false },
      ],
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs: {} },
      userRegions: [], timeLimitSec: 5, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    const estimated = estimatePlacementVars(input);
    const actual = buildMipModel(input).vars.length;
    expect(estimated).toBe(actual);
  });

  it('returns 0 when there are no plants', () => {
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 },
      plants: [],
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs: {} },
      userRegions: [], timeLimitSec: 5, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    expect(estimatePlacementVars(input)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `npx vitest run src/optimizer/formulation.test.ts`
Expected: FAIL — `estimatePlacementVars is not exported`.

- [ ] **Step 3: Implement `estimatePlacementVars` in `formulation.ts`.**

Add at the end of `src/optimizer/formulation.ts`:

```ts
/**
 * Estimate the placement-var count without building the full model. Mirrors the
 * candidate-cell pitch logic in buildMipModel so the worker can decide whether
 * to invoke the clustered solve path before paying the cost of model construction.
 */
export function estimatePlacementVars(input: OptimizationInput): number {
  const { bed, plants, gridResolutionIn: g } = input;
  const cols = Math.floor((bed.widthIn - 2 * bed.edgeClearanceIn) / g);
  const rows = Math.floor((bed.lengthIn - 2 * bed.edgeClearanceIn) / g);
  let total = 0;
  for (const plant of plants) {
    const stride = Math.max(1, Math.round(plant.footprintIn / g / 2));
    let candidateCells = 0;
    for (let i = 0; i < cols; i++) {
      if (i % stride !== 0) continue;
      for (let j = 0; j < rows; j++) {
        if (j % stride !== 0) continue;
        const xCenter = bed.edgeClearanceIn + (i + 0.5) * g;
        const yCenter = bed.edgeClearanceIn + (j + 0.5) * g;
        const r = plant.footprintIn / 2;
        if (
          xCenter - r >= bed.edgeClearanceIn &&
          xCenter + r <= bed.widthIn - bed.edgeClearanceIn &&
          yCenter - r >= bed.edgeClearanceIn &&
          yCenter + r <= bed.lengthIn - bed.edgeClearanceIn
        ) {
          candidateCells++;
        }
      }
    }
    total += plant.count * candidateCells;
  }
  return total;
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `npx vitest run src/optimizer/formulation.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit.**

```bash
git add src/optimizer/formulation.ts src/optimizer/formulation.test.ts
git commit -m "feat(optimizer): add estimatePlacementVars helper for threshold gating"
```

---

## Task 5: familyCompanionPartitioner

**Files:**
- Create: `src/optimizer/partitioning/familyCompanion.ts`
- Create: `src/optimizer/partitioning/familyCompanion.test.ts`

- [ ] **Step 1: Write failing tests for the partitioner.**

Create `src/optimizer/partitioning/familyCompanion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { familyCompanionPartitioner } from './familyCompanion';
import { DEFAULT_WEIGHTS, type OptimizationInput, type OptimizerPlant } from '../types';

function makeInput(plants: OptimizerPlant[], pairs: Record<string, 'companion' | 'antagonist'> = {}): OptimizationInput {
  return {
    bed: { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 },
    plants,
    weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs },
    userRegions: [], timeLimitSec: 5, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
  };
}

describe('familyCompanionPartitioner', () => {
  it('groups plants by category', () => {
    const input = makeInput([
      { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
      { cultivarId: 'basil', count: 4, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
    ]);
    const clusters = familyCompanionPartitioner(input);
    expect(clusters.length).toBe(2);
    const keys = clusters.map((c) => c.key).sort();
    expect(keys).toEqual(['herbs', 'vegetables']);
  });

  it('groups plants without category into a single "other" cluster', () => {
    const input = makeInput([
      { cultivarId: 'mystery', count: 2, footprintIn: 8, heightIn: null, climber: false },
      { cultivarId: 'unknown', count: 2, footprintIn: 8, heightIn: null, climber: false },
    ]);
    const clusters = familyCompanionPartitioner(input);
    expect(clusters.length).toBe(1);
    expect(clusters[0].key).toBe('other');
    expect(clusters[0].plants.length).toBe(2);
  });

  it('merges two categories when a strong companion bridge exists', () => {
    const input = makeInput(
      [
        { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
        { cultivarId: 'basil', count: 4, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
      ],
      { 'basil|tomato': 'companion' },
    );
    const clusters = familyCompanionPartitioner(input);
    expect(clusters.length).toBe(1);
    expect(clusters[0].plants.length).toBe(2);
  });

  it('does not merge when only an antagonist relation exists', () => {
    const input = makeInput(
      [
        { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
        { cultivarId: 'fennel', count: 4, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
      ],
      { 'fennel|tomato': 'antagonist' },
    );
    const clusters = familyCompanionPartitioner(input);
    expect(clusters.length).toBe(2);
  });

  it('chains merges transitively (A↔B and B↔C produce one cluster)', () => {
    const input = makeInput(
      [
        { cultivarId: 'tomato', count: 2, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
        { cultivarId: 'basil', count: 2, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
        { cultivarId: 'marigold', count: 2, footprintIn: 6, heightIn: null, climber: false, category: 'flowers' },
      ],
      { 'basil|tomato': 'companion', 'basil|marigold': 'companion' },
    );
    const clusters = familyCompanionPartitioner(input);
    expect(clusters.length).toBe(1);
    expect(clusters[0].plants.length).toBe(3);
  });

  it('counts climbers per cluster', () => {
    const input = makeInput([
      { cultivarId: 'pole-bean', count: 6, footprintIn: 6, heightIn: null, climber: true, category: 'legumes' },
      { cultivarId: 'tomato', count: 2, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
    ]);
    const clusters = familyCompanionPartitioner(input);
    const beans = clusters.find((c) => c.key === 'legumes')!;
    const veggies = clusters.find((c) => c.key === 'vegetables')!;
    expect(beans.climberCount).toBe(6);
    expect(veggies.climberCount).toBe(0);
  });

  it('orders clusters by total footprint area descending (largest first)', () => {
    const input = makeInput([
      { cultivarId: 'basil', count: 2, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
      { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
    ]);
    const clusters = familyCompanionPartitioner(input);
    expect(clusters[0].key).toBe('vegetables');
    expect(clusters[1].key).toBe('herbs');
  });

  it('produces deterministic ordering for identical inputs', () => {
    const input = makeInput([
      { cultivarId: 'a', count: 2, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
      { cultivarId: 'b', count: 2, footprintIn: 6, heightIn: null, climber: false, category: 'flowers' },
    ]);
    const c1 = familyCompanionPartitioner(input);
    const c2 = familyCompanionPartitioner(input);
    expect(c1.map((c) => c.key)).toEqual(c2.map((c) => c.key));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail.**

Run: `npx vitest run src/optimizer/partitioning/`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the partitioner.**

Create `src/optimizer/partitioning/familyCompanion.ts`:

```ts
import type { Cluster, OptimizationInput, OptimizerPlant } from '../types';

const MERGE_THRESHOLD = 1; // one companion pair (count product 1, weight 1) suffices

/**
 * Partition plants into clusters by category, then iteratively merge clusters
 * whose strongest companion bridge meets `MERGE_THRESHOLD`. Plants with no
 * category go into a single "other" bucket. Antagonist relations contribute
 * negative weight to bridge strength but do not on their own block a merge —
 * they only counter companion ties within the same pair of categories.
 *
 * Output is sorted by total footprint area descending (largest cluster first)
 * for deterministic ordering across identical inputs.
 */
export function familyCompanionPartitioner(input: OptimizationInput): Cluster[] {
  // Step 1: bucket by category
  const buckets = new Map<string, OptimizerPlant[]>();
  for (const plant of input.plants) {
    const key = plant.category ?? 'other';
    const arr = buckets.get(key) ?? [];
    arr.push(plant);
    buckets.set(key, arr);
  }

  // Working group state
  let groups: { key: string; plants: OptimizerPlant[] }[] = [];
  for (const [key, plants] of buckets) groups.push({ key, plants });

  // Step 2: iteratively merge by strongest positive bridge
  const maxIterations = Math.max(0, groups.length - 1);
  for (let iter = 0; iter < maxIterations; iter++) {
    let bestI = -1;
    let bestJ = -1;
    let bestStrength = MERGE_THRESHOLD;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const s = bridgeStrength(groups[i], groups[j], input);
        if (s > bestStrength) {
          bestStrength = s;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0) break;
    const merged = {
      key: `${groups[bestI].key}+${groups[bestJ].key}`,
      plants: [...groups[bestI].plants, ...groups[bestJ].plants],
    };
    groups = groups.filter((_, idx) => idx !== bestI && idx !== bestJ);
    groups.push(merged);
  }

  // Step 3: build Cluster output with climberCount and area-descending order
  const clusters: Cluster[] = groups.map((g) => ({
    key: g.key,
    plants: g.plants,
    climberCount: g.plants.reduce((sum, p) => sum + (p.climber ? p.count : 0), 0),
  }));

  clusters.sort((a, b) => totalFootprintArea(b) - totalFootprintArea(a));
  return clusters;
}

function bridgeStrength(
  a: { plants: OptimizerPlant[] },
  b: { plants: OptimizerPlant[] },
  input: OptimizationInput,
): number {
  const wCompanion = input.weights.companion;
  const wAntagonist = input.weights.antagonist;
  let total = 0;
  for (const pa of a.plants) {
    for (const pb of b.plants) {
      const key = [pa.cultivarId, pb.cultivarId].sort().join('|');
      const rel = input.companions.pairs[key];
      const weight = rel === 'companion' ? wCompanion : rel === 'antagonist' ? -wAntagonist : 0;
      total += pa.count * pb.count * weight;
    }
  }
  return total;
}

function totalFootprintArea(c: { plants: OptimizerPlant[] }): number {
  let total = 0;
  for (const p of c.plants) {
    const r = p.footprintIn / 2;
    total += p.count * Math.PI * r * r;
  }
  return total;
}
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `npx vitest run src/optimizer/partitioning/`
Expected: all 8 tests pass.

- [ ] **Step 5: Commit.**

```bash
git add src/optimizer/partitioning/
git commit -m "feat(optimizer): add familyCompanionPartitioner"
```

---

## Task 6: proportionalStripAllocator

**Files:**
- Create: `src/optimizer/allocation/proportionalStrip.ts`
- Create: `src/optimizer/allocation/proportionalStrip.test.ts`

- [ ] **Step 1: Write failing tests for the allocator.**

Create `src/optimizer/allocation/proportionalStrip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { proportionalStripAllocator } from './proportionalStrip';
import type { Cluster, OptimizerBed } from '../types';

function makeCluster(key: string, footprintIn: number, count: number, climbers = 0): Cluster {
  const plants = [
    { cultivarId: `c-${key}`, count, footprintIn, heightIn: null, climber: false, category: key },
  ];
  if (climbers > 0) {
    plants.push({ cultivarId: `cl-${key}`, count: climbers, footprintIn, heightIn: null, climber: true, category: key });
  }
  return {
    key,
    plants,
    climberCount: climbers,
  };
}

describe('proportionalStripAllocator', () => {
  it('returns the whole bed unchanged for a single cluster', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 };
    const subBeds = proportionalStripAllocator(bed, [makeCluster('a', 12, 4)]);
    expect(subBeds.length).toBe(1);
    expect(subBeds[0].bed.widthIn).toBe(48);
    expect(subBeds[0].bed.lengthIn).toBe(96);
    expect(subBeds[0].offsetIn).toEqual({ x: 0, y: 0 });
  });

  it('splits along the long axis with no trellis', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 };
    // Two equal-area clusters: 48x96 should split into two 48-wide x 48-tall strips
    const subBeds = proportionalStripAllocator(bed, [
      makeCluster('a', 12, 4),
      makeCluster('b', 12, 4),
    ]);
    expect(subBeds.length).toBe(2);
    // Long axis = lengthIn (96 > 48), so strips stack along Y
    expect(subBeds[0].bed.widthIn).toBe(48);
    expect(subBeds[1].bed.widthIn).toBe(48);
    const totalLen = subBeds[0].bed.lengthIn + subBeds[1].bed.lengthIn;
    expect(totalLen).toBeCloseTo(96, 5);
    // Strips should be contiguous: second strip's offset y = first strip's lengthIn
    expect(subBeds[1].offsetIn.y).toBeCloseTo(subBeds[0].bed.lengthIn, 5);
  });

  it('places climber-containing clusters adjacent to the trellis edge', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, trellis: { kind: 'edge', edge: 'N' }, edgeClearanceIn: 0 };
    // Two clusters of equal area, one with climbers
    const noClimbers = makeCluster('veggies', 12, 4);
    const withClimbers = makeCluster('legumes', 12, 4, 2);
    const subBeds = proportionalStripAllocator(bed, [noClimbers, withClimbers]);
    expect(subBeds.length).toBe(2);
    // Trellis is on N (y=0), so the climber strip should have offsetIn.y === 0
    const climberSub = subBeds.find((sb) => sb.cluster.key === 'legumes')!;
    const veggieSub = subBeds.find((sb) => sb.cluster.key === 'veggies')!;
    expect(climberSub.offsetIn.y).toBe(0);
    // Climber strip should carry the trellis on its N edge
    expect(climberSub.bed.trellis).toEqual({ kind: 'edge', edge: 'N' });
    // Veggie strip has no trellis
    expect(veggieSub.bed.trellis).toBeNull();
  });

  it('proportions strip widths by total footprint area', () => {
    const bed: OptimizerBed = { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 };
    // Cluster A: count=4, footprint=12 → area = 4 × π × 36 ≈ 452
    // Cluster B: count=4, footprint=6  → area = 4 × π × 9  ≈ 113
    // Ratio ≈ 4:1, so A should claim ~80% of the long axis
    const subBeds = proportionalStripAllocator(bed, [
      makeCluster('big', 12, 4),
      makeCluster('small', 6, 4),
    ]);
    const big = subBeds.find((sb) => sb.cluster.key === 'big')!;
    const small = subBeds.find((sb) => sb.cluster.key === 'small')!;
    // Big strip ≈ 76.8 inches long (96 × 4/(4+1)), small ≈ 19.2
    expect(big.bed.lengthIn).toBeGreaterThan(small.bed.lengthIn);
    expect(big.bed.lengthIn + small.bed.lengthIn).toBeCloseTo(96, 5);
  });

  it('rejects trellis line (interior trellis not supported in v1)', () => {
    const bed: OptimizerBed = {
      widthIn: 48, lengthIn: 96,
      trellis: { kind: 'line', orientation: 'horizontal', offsetIn: 48 },
      edgeClearanceIn: 0,
    };
    expect(() => proportionalStripAllocator(bed, [makeCluster('a', 12, 4)])).toThrow(/interior trellis/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail.**

Run: `npx vitest run src/optimizer/allocation/`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the allocator.**

Create `src/optimizer/allocation/proportionalStrip.ts`:

```ts
import type { Cluster, OptimizerBed, SubBed, TrellisLocation } from '../types';

/**
 * Slice the bed into parallel strips, one per cluster, with strip widths
 * proportional to each cluster's total footprint area.
 *
 * Strip orientation: parallel to the trellis line (so the trellis runs *along*
 * the strip), or parallel to the bed's long axis when no trellis. Climber-
 * containing clusters get the strip(s) adjacent to the trellis line.
 *
 * V1 supports only edge trellises. Interior trellises (kind: 'line') are
 * deferred — they require the bed to be split *across* the trellis first,
 * which the area-allocation interface doesn't yet support.
 */
export function proportionalStripAllocator(bed: OptimizerBed, clusters: Cluster[]): SubBed[] {
  if (bed.trellis && bed.trellis.kind === 'line') {
    throw new Error('interior trellis (kind: "line") not supported in v1; deferred to TODO');
  }
  if (clusters.length === 0) return [];

  const orientation = stripOrientation(bed);
  const longAxisLen = orientation === 'horizontal' ? bed.lengthIn : bed.widthIn;
  // Strips run *along* `orientation`. Strip widths consume the perpendicular axis.
  // 'horizontal' strips run along X (vary in Y); 'vertical' strips run along Y (vary in X).
  // longAxisLen is the dimension that gets sliced.

  // Sort clusters: climber-containing first (so they get the trellis-adjacent strip),
  // then by footprint area descending. Stable within tie.
  const orderedClusters = orderClustersForTrellis(clusters, bed.trellis);

  const totalArea = clusters.reduce((sum, c) => sum + clusterArea(c), 0);
  if (totalArea <= 0) {
    // Degenerate: equal-share fallback
    return equalShareSubBeds(bed, orderedClusters, orientation);
  }

  // Compute strip extents along the long axis
  const extents: { cluster: Cluster; start: number; end: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < orderedClusters.length; i++) {
    const c = orderedClusters[i];
    const share = clusterArea(c) / totalArea;
    const len = i === orderedClusters.length - 1 ? longAxisLen - cursor : longAxisLen * share;
    extents.push({ cluster: c, start: cursor, end: cursor + len });
    cursor += len;
  }

  // Build SubBed entries
  const subBeds: SubBed[] = [];
  for (let i = 0; i < extents.length; i++) {
    const { cluster, start, end } = extents[i];
    const stripLen = end - start;
    const adjacentToTrellis = i === 0 && bed.trellis && bed.trellis.kind === 'edge';
    const subTrellis: TrellisLocation | null = adjacentToTrellis ? bed.trellis : null;
    if (orientation === 'horizontal') {
      subBeds.push({
        cluster,
        bed: {
          widthIn: bed.widthIn,
          lengthIn: stripLen,
          trellis: subTrellis,
          edgeClearanceIn: bed.edgeClearanceIn,
        },
        offsetIn: { x: 0, y: start },
      });
    } else {
      subBeds.push({
        cluster,
        bed: {
          widthIn: stripLen,
          lengthIn: bed.lengthIn,
          trellis: subTrellis,
          edgeClearanceIn: bed.edgeClearanceIn,
        },
        offsetIn: { x: start, y: 0 },
      });
    }
  }
  return subBeds;
}

function stripOrientation(bed: OptimizerBed): 'horizontal' | 'vertical' {
  // With a trellis edge, strips run parallel to the trellis: N/S trellis →
  // horizontal strips (vary in Y); E/W trellis → vertical strips (vary in X).
  if (bed.trellis && bed.trellis.kind === 'edge') {
    return bed.trellis.edge === 'N' || bed.trellis.edge === 'S' ? 'horizontal' : 'vertical';
  }
  // No trellis: strips run along the long axis.
  return bed.lengthIn >= bed.widthIn ? 'horizontal' : 'vertical';
}

function orderClustersForTrellis(clusters: Cluster[], trellis: OptimizerBed['trellis']): Cluster[] {
  const isEdge = trellis && trellis.kind === 'edge';
  // First pass: split into climbers and others, sort each by area desc
  const sorted = [...clusters].sort((a, b) => clusterArea(b) - clusterArea(a));
  if (!isEdge) return sorted;
  const withClimbers = sorted.filter((c) => c.climberCount > 0);
  const without = sorted.filter((c) => c.climberCount === 0);
  // Climber cluster with the most climbers goes first (adjacent to trellis).
  withClimbers.sort((a, b) => b.climberCount - a.climberCount);
  // Reverse the trellis-adjacent strip ordering for S/E edges so the first
  // strip in the output is the one that ends up at the trellis edge after
  // offsetIn placement. For N/W edges the first strip naturally sits at the
  // trellis edge (offsetIn = 0 on the relevant axis).
  if (trellis.edge === 'S' || trellis.edge === 'E') {
    // For S/E edges the trellis-adjacent strip is at the *end* of the long axis.
    // Reverse so the climber cluster ends up last in extents, hence adjacent.
    return [...without, ...withClimbers];
  }
  return [...withClimbers, ...without];
}

function equalShareSubBeds(
  bed: OptimizerBed,
  clusters: Cluster[],
  orientation: 'horizontal' | 'vertical',
): SubBed[] {
  const longAxisLen = orientation === 'horizontal' ? bed.lengthIn : bed.widthIn;
  const stripLen = longAxisLen / clusters.length;
  return clusters.map((cluster, i) => {
    const start = i * stripLen;
    if (orientation === 'horizontal') {
      return {
        cluster,
        bed: { widthIn: bed.widthIn, lengthIn: stripLen, trellis: null, edgeClearanceIn: bed.edgeClearanceIn },
        offsetIn: { x: 0, y: start },
      };
    }
    return {
      cluster,
      bed: { widthIn: stripLen, lengthIn: bed.lengthIn, trellis: null, edgeClearanceIn: bed.edgeClearanceIn },
      offsetIn: { x: start, y: 0 },
    };
  });
}

function clusterArea(cluster: Cluster): number {
  let total = 0;
  for (const p of cluster.plants) {
    const r = p.footprintIn / 2;
    total += p.count * Math.PI * r * r;
  }
  return total;
}
```

Note: the v1 deliberately skips the minimum-strip-width clamp from the spec. If a strip ends up too narrow for its plants, the sub-bed solve will simply place fewer plants — same UX as if the user requested too many plants for the bed. Adding the clamp would force an early error and complicate the failure-handling story; we can revisit if it becomes a real problem in practice.

- [ ] **Step 4: Run tests to verify they pass.**

Run: `npx vitest run src/optimizer/allocation/`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit.**

```bash
git add src/optimizer/allocation/
git commit -m "feat(optimizer): add proportionalStripAllocator"
```

---

## Task 7: Wire clustering into the worker

**Files:**
- Modify: `src/optimizer/worker.ts`

- [ ] **Step 1: Refactor `solve()` to extract `solveUnified` and add `solveClustered` with threshold gating.**

Open `src/optimizer/worker.ts` and replace the `solve` function and add helpers. The full new structure:

```ts
import { buildMipModel, estimatePlacementVars } from './formulation';
import { greedyHexPack } from './seed';
import { buildNoGoodCut, perturbWeights } from './diversity';
import { familyCompanionPartitioner } from './partitioning/familyCompanion';
import { proportionalStripAllocator } from './allocation/proportionalStrip';
import type { MipModel } from './formulation';
import type {
  OptimizationInput, OptimizationResult, OptimizationCandidate,
  OptimizerPlacement, Cluster, SubBed,
} from './types';

const MAX_UNIFIED_VARS = 500;
const SAME_SPECIES_ADJ_BUDGET = 1500;
```

Replace the existing `solve` function with this version (keep the message-handling code at the top of the file unchanged):

```ts
async function solve(
  input: OptimizationInput,
  onProgress: (phase: string, candidate: number) => void,
  isCancelled: () => boolean,
): Promise<OptimizationResult> {
  const start = performance.now();
  const candidates: OptimizationCandidate[] = [];
  // priorActive is per-cluster-key for the clustered path, single-key 'unified' for the unified path
  const priorActiveByKey: Map<string, string[]> = new Map();

  for (let n = 0; n < input.candidateCount; n++) {
    if (isCancelled()) break;
    onProgress('build', n);

    const weights = n === 0 ? input.weights : perturbWeights(input.weights, 0.05, 1000 + n);
    const workingInput = { ...input, weights };

    const useClustered = estimatePlacementVars(workingInput) > MAX_UNIFIED_VARS;
    const candidate = useClustered
      ? await solveClustered(workingInput, n, priorActiveByKey, onProgress, isCancelled)
      : await solveUnified(workingInput, n, priorActiveByKey, onProgress, isCancelled);

    if (candidate) candidates.push(candidate);
  }

  return { candidates, totalMs: performance.now() - start };
}

async function solveUnified(
  input: OptimizationInput,
  n: number,
  priorActiveByKey: Map<string, string[]>,
  onProgress: (phase: string, candidate: number) => void,
  isCancelled: () => boolean,
): Promise<OptimizationCandidate | null> {
  if (isCancelled()) return null;
  const solveStart = performance.now();
  const model = buildMipModel(input);

  const prior = priorActiveByKey.get('unified') ?? [];
  if (n > 0 && prior.length > 0) {
    model.constraints.push({ ...buildNoGoodCut(prior, input.diversityThreshold), label: `nogood:${n}` });
  }

  applySameSpeciesAdjStrip(model, n);

  onProgress('solve', n);
  greedyHexPack(input);

  const HighsModule = await loadHighs();
  const lpString = mipModelToLpString(model);
  console.info(
    '[optimizer] candidate', n, 'unified',
    'vars:', model.vars.length, 'aux:', model.aux.length,
    'constraints:', model.constraints.length, 'lpBytes:', lpString.length,
  );
  const solution = trySolve(HighsModule, lpString, solveOpts(input));
  if (!solution) {
    console.warn('[optimizer] candidate', n, 'unified solver crashed; falling back to greedy hex pack');
    return greedyCandidate(input, performance.now() - solveStart, ['unified']);
  }
  if (solution.Status !== 'Optimal' && solution.Status !== 'Time limit reached') {
    console.warn('[optimizer] candidate', n, 'unified status:', solution.Status);
    return null;
  }
  const placements = placementsFrom(model, solution.Columns);
  if (placements.length === 0) {
    console.warn('[optimizer] candidate', n, 'unified has no placements — status:', solution.Status, 'obj:', solution.ObjectiveValue);
    return null;
  }
  priorActiveByKey.set('unified', activeVarNames(model, solution.Columns));
  return {
    placements,
    score: solution.ObjectiveValue,
    reason: reasonLabel(input, placements),
    gap: 0,
    solveMs: performance.now() - solveStart,
  };
}

async function solveClustered(
  input: OptimizationInput,
  n: number,
  priorActiveByKey: Map<string, string[]>,
  onProgress: (phase: string, candidate: number) => void,
  isCancelled: () => boolean,
): Promise<OptimizationCandidate | null> {
  const solveStart = performance.now();
  const clusters = familyCompanionPartitioner(input);
  const subBeds = proportionalStripAllocator(input.bed, clusters);

  const allPlacements: OptimizerPlacement[] = [];
  let scoreSum = 0;
  let worstGap = 0;
  const fallbackKeys: string[] = [];

  for (const subBed of subBeds) {
    if (isCancelled()) return null;
    const subInput = buildSubInput(input, subBed);

    onProgress(`solve cluster ${subBed.cluster.key}`, n);
    const subStart = performance.now();
    const model = buildMipModel(subInput);

    const prior = priorActiveByKey.get(subBed.cluster.key) ?? [];
    if (n > 0 && prior.length > 0) {
      model.constraints.push({ ...buildNoGoodCut(prior, subInput.diversityThreshold), label: `nogood:${n}` });
    }

    applySameSpeciesAdjStrip(model, n);

    const HighsModule = await loadHighs();
    const lpString = mipModelToLpString(model);
    console.info(
      '[optimizer] candidate', n, 'cluster', subBed.cluster.key,
      'vars:', model.vars.length, 'aux:', model.aux.length,
      'constraints:', model.constraints.length, 'lpBytes:', lpString.length,
    );

    const solution = trySolve(HighsModule, lpString, solveOpts(subInput));
    let subPlacements: OptimizerPlacement[] = [];
    let usedGreedy = false;
    if (!solution || solution.Status === 'Infeasible') {
      console.warn('[optimizer] candidate', n, 'cluster', subBed.cluster.key, 'crashed; greedy fallback');
      const greedy = greedyHexPack(subInput);
      subPlacements = greedy.map((g) => ({ cultivarId: g.cultivarId, xIn: g.xIn, yIn: g.yIn }));
      usedGreedy = true;
      worstGap = 1;
    } else {
      subPlacements = placementsFrom(model, solution.Columns);
      priorActiveByKey.set(subBed.cluster.key, activeVarNames(model, solution.Columns));
      scoreSum += solution.ObjectiveValue ?? 0;
    }

    if (usedGreedy) fallbackKeys.push(subBed.cluster.key);

    // Translate sub-bed-local coords back to parent-bed coords
    for (const p of subPlacements) {
      allPlacements.push({
        cultivarId: p.cultivarId,
        xIn: p.xIn + subBed.offsetIn.x,
        yIn: p.yIn + subBed.offsetIn.y,
      });
    }
    void subStart; // currently unused; reserved for per-cluster solveMs
  }

  if (allPlacements.length === 0) return null;
  return {
    placements: allPlacements,
    score: scoreSum,
    reason: clusteredReasonLabel(clusters, allPlacements.length, fallbackKeys),
    gap: worstGap,
    solveMs: performance.now() - solveStart,
  };
}

function buildSubInput(parent: OptimizationInput, subBed: SubBed): OptimizationInput {
  // Translate userRegions into sub-bed-local coords; drop those entirely outside.
  const translatedRegions = parent.userRegions
    .map((r) => ({
      xIn: r.xIn - subBed.offsetIn.x,
      yIn: r.yIn - subBed.offsetIn.y,
      widthIn: r.widthIn,
      lengthIn: r.lengthIn,
      preferredCultivarIds: r.preferredCultivarIds,
    }))
    .filter((r) =>
      r.xIn + r.widthIn > 0 && r.yIn + r.lengthIn > 0 &&
      r.xIn < subBed.bed.widthIn && r.yIn < subBed.bed.lengthIn,
    );
  return {
    ...parent,
    bed: subBed.bed,
    plants: subBed.cluster.plants,
    userRegions: translatedRegions,
  };
}

function applySameSpeciesAdjStrip(model: MipModel, n: number): void {
  const sameSpeciesAux = sameSpeciesAuxNames(model);
  const sameSpeciesAdjCount = model.constraints.filter((c) =>
    isAdjRowForAux(c.label, sameSpeciesAux),
  ).length;
  if (sameSpeciesAdjCount > SAME_SPECIES_ADJ_BUDGET) {
    console.warn(
      '[optimizer] candidate', n,
      `same-species adjacency rows (${sameSpeciesAdjCount}) exceed budget (${SAME_SPECIES_ADJ_BUDGET}); stripping aux+rows`,
    );
    model.constraints = model.constraints.filter((c) => !isAdjRowForAux(c.label, sameSpeciesAux));
    model.aux = model.aux.filter((a) => !sameSpeciesAux.has(a.name));
  }
}

function solveOpts(input: OptimizationInput) {
  return {
    time_limit: input.timeLimitSec,
    mip_rel_gap: input.mipGap,
    output_flag: false,
    log_to_console: false,
  };
}

function greedyCandidate(
  input: OptimizationInput,
  solveMs: number,
  fallbackKeys: string[],
): OptimizationCandidate | null {
  const greedy = greedyHexPack(input);
  if (greedy.length === 0) return null;
  return {
    placements: greedy.map((g) => ({ cultivarId: g.cultivarId, xIn: g.xIn, yIn: g.yIn })),
    score: 0,
    reason: `${greedy.length} plants placed (greedy fallback: ${fallbackKeys.join(', ')})`,
    gap: 1,
    solveMs,
  };
}

function clusteredReasonLabel(clusters: Cluster[], placedCount: number, fallbackKeys: string[]): string {
  const keys = clusters.map((c) => c.key).join(', ');
  const fallbackNote = fallbackKeys.length > 0
    ? ` (greedy fallback: ${fallbackKeys.join(', ')})`
    : '';
  return `${placedCount} plants placed across ${clusters.length} groups (${keys})${fallbackNote}`;
}
```

Keep the existing helpers at the bottom of the file unchanged (`mipModelToLpString`, `formatCoeff`, `trySolve`, `placementsFrom`, `activeVarNames`, `reasonLabel`, `loadHighs`, `sameSpeciesAuxNames`, `isAdjRowForAux`, `sanitizeName`, the `HighsSolution` interface). Remove the now-redundant inline same-species-adj-strip block from the original `solve` body — it has been factored into `applySameSpeciesAdjStrip`.

- [ ] **Step 2: Run optimizer tests.**

Run: `npx vitest run src/optimizer/`
Expected: all existing tests still pass.

- [ ] **Step 3: Run full build.**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 4: Commit.**

```bash
git add src/optimizer/worker.ts
git commit -m "feat(optimizer): clustered solve path gated by placement-var threshold"
```

---

## Task 8: End-to-end clustered-pipeline test

**Files:**
- Create: `src/optimizer/clustered.test.ts`

- [ ] **Step 1: Write the test.**

Create `src/optimizer/clustered.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { familyCompanionPartitioner } from './partitioning/familyCompanion';
import { proportionalStripAllocator } from './allocation/proportionalStrip';
import { estimatePlacementVars } from './formulation';
import { DEFAULT_WEIGHTS, type OptimizationInput, type OptimizerPlant } from './types';

// Verifies the wiring contract that solveClustered relies on, without
// invoking the worker (which requires a real Web Worker + HiGHS-WASM).
// The end-to-end MILP solve is exercised by runOptimizer.test.ts already.

describe('clustered pipeline wiring', () => {
  it('estimates above the threshold for a many-plant input', () => {
    const plants: OptimizerPlant[] = [
      { cultivarId: 'tomato', count: 6, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
      { cultivarId: 'pepper', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
      { cultivarId: 'basil', count: 8, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
      { cultivarId: 'thyme', count: 4, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
    ];
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 },
      plants,
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs: {} },
      userRegions: [], timeLimitSec: 5, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    expect(estimatePlacementVars(input)).toBeGreaterThan(500);
  });

  it('partitions and allocates produce non-overlapping covering sub-beds', () => {
    const plants: OptimizerPlant[] = [
      { cultivarId: 'tomato', count: 4, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
      { cultivarId: 'basil', count: 8, footprintIn: 6, heightIn: null, climber: false, category: 'herbs' },
    ];
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 },
      plants,
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs: {} },
      userRegions: [], timeLimitSec: 5, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    const clusters = familyCompanionPartitioner(input);
    const subBeds = proportionalStripAllocator(input.bed, clusters);
    expect(subBeds.length).toBe(2);
    // Verify strips tile the bed with no gaps and no overlap along the long axis
    const sortedY = subBeds
      .map((sb) => ({ start: sb.offsetIn.y, end: sb.offsetIn.y + sb.bed.lengthIn }))
      .sort((a, b) => a.start - b.start);
    expect(sortedY[0].start).toBe(0);
    expect(sortedY[0].end).toBeCloseTo(sortedY[1].start, 5);
    expect(sortedY[1].end).toBeCloseTo(96, 5);
  });

  it('one-cluster input falls back to a single sub-bed equal to the parent', () => {
    const plants: OptimizerPlant[] = [
      { cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null, climber: false, category: 'vegetables' },
    ];
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 },
      plants,
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4, companions: { pairs: {} },
      userRegions: [], timeLimitSec: 5, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    const clusters = familyCompanionPartitioner(input);
    const subBeds = proportionalStripAllocator(input.bed, clusters);
    expect(subBeds.length).toBe(1);
    expect(subBeds[0].bed.widthIn).toBe(input.bed.widthIn);
    expect(subBeds[0].bed.lengthIn).toBe(input.bed.lengthIn);
    expect(subBeds[0].offsetIn).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run the test.**

Run: `npx vitest run src/optimizer/clustered.test.ts`
Expected: 3 tests pass.

- [ ] **Step 3: Run the full test suite.**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 4: Run a full build.**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 5: Commit.**

```bash
git add src/optimizer/clustered.test.ts
git commit -m "test(optimizer): end-to-end wiring test for clustered pipeline"
```

---

## Task 9: TODO entries for deferred enhancements

**Files:**
- Modify: `docs/TODO.md`

- [ ] **Step 1: Append the deferred-enhancement entries.**

Open `docs/TODO.md` and append (at the end, under the relevant section, or append a new section heading `## Optimizer auto-clustering follow-ups`):

```markdown
## Optimizer auto-clustering follow-ups

- Visualize cluster regions on the canvas (overlay shading per group), gated on user opt-in to define regions
- Post-hoc cluster rotation/swap pass to reclaim cross-cluster companion bonuses lost at partition boundaries
- Greedy fallback that respects existing intentional placements rather than producing a generic hex-packed layout
- Interior trellis support (`trellis: { kind: 'line', ... }`): UI for placement, allocator for dual-side strip layout. Currently rejected with an error in `proportionalStripAllocator`.
- Adaptive partitioner selection based on input shape (homogeneous bypass, paired-mirror, diversity-spread)
- Adaptive allocator selection (guillotine cuts, bin-packing) — currently only proportional strips
- Parallel sub-bed solves via multiple workers — currently sequential within a single worker
- Cross-cluster score reported as a candidate-comparison stat (no objective contribution, just informational)
- Minimum strip width enforcement in `proportionalStripAllocator` (currently allows arbitrarily thin strips; fewer plants get placed but no error fires)
```

- [ ] **Step 2: Commit.**

```bash
git add docs/TODO.md
git commit -m "docs(todo): defer auto-clustering follow-ups"
```

---

## Task 10: Manual smoke verification

**Files:**
- None (read-only verification)

- [ ] **Step 1: Run dev server and exercise the optimizer in the deployed app.**

Run: `npm run dev` and open the app in a browser. With the default garden, open a raised bed and request 8 tomatoes (the historical crash repro). Verify a layout appears.

- [ ] **Step 2: Try a multi-cluster case.**

Add 4 tomatoes + 6 basil + 4 thyme + 4 oregano (mixed categories) to a 4×8ft raised bed. Verify a layout appears. Check the browser console for `[optimizer] candidate N cluster <key> vars: ...` lines confirming the clustered path fired. Verify the candidate `reason` text mentions group counts.

- [ ] **Step 3: Try a small-bed case to confirm unified path still runs.**

Add 4 plants in a small bed (e.g., 2×3ft with 4 basil). Verify console logs show `unified` (not `cluster ...`). Verify a layout appears.

- [ ] **Step 4: If anything is broken, file the symptoms in a follow-up TODO entry rather than blocking on perfection here.**

The clustered path is heuristic — placements may look uneven, particularly when one cluster gets a thin strip. That's expected behavior, not a bug. Investigate post-merge if the user finds a specific layout objectionable.
