# Raised-Bed Groundwork — Implementation Plan (Plan 0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the small shared model additions (cultivar `heightFt`/`climber`, `bed.trellisEdge`, and the `cultivarSpacing` resolvers) that both the new arrangement strategies (Plan 1) and the optimizer (Plan 2) consume — so the larger plans can proceed in parallel.

**Architecture:** Three additive model fields and one new pure module. No behavior changes to existing structures, no UI changes. All new fields are optional/nullable so existing data migrates trivially. `src/model/cultivarSpacing.ts` is a stateless module of pure functions consumed by future strategies and the optimizer's project-side adapter — it does NOT live inside `src/optimizer/`.

**Tech Stack:** TypeScript, existing `src/model/` patterns, vitest.

**Spec reference:** `docs/superpowers/specs/2026-05-04-raised-bed-layout-strategies-design.md` §Architecture, §Cultivar-driven spacing.

---

## File Structure

- Create: `src/model/cultivarSpacing.ts` — pure resolvers (`defaultPitchFor`, `squareFootCountFor`, `defaultClearanceFor`, `companions`)
- Create: `src/model/cultivarSpacing.test.ts`
- Create: `src/data/companions.ts` — small curated companion/antagonist seed table (~30 pairs)
- Modify: `src/model/cultivars.ts` — add optional `heightFt`, `climber` to `Cultivar` and `CultivarRaw`; resolve from species defaults
- Modify: `src/model/species.ts` — add optional `heightFt`, `climber` to `Species`
- Modify: `src/model/types.ts` — add optional `trellisEdge: 'N' | 'E' | 'S' | 'W' | null` to `Structure`; default to `null` in `createStructure`
- Modify: `src/model/types.test.ts` — assert defaults
- Modify: `docs/behavior.md` — note new optional fields
- Modify: `docs/TODO.md` — strike "deferred companion table" once seed table lands; record any deferrals

---

### Task 1: Add `heightFt` and `climber` to `Species`

**Files:**
- Modify: `src/model/species.ts:14-29`

- [ ] **Step 1: Read `src/model/species.ts` and confirm shape**

- [ ] **Step 2: Add fields to the `Species` interface**

```ts
export interface Species {
  id: string;
  name: string;
  taxonomicName: string;
  category: CultivarCategory;
  color: string;
  footprintFt: number;
  spacingFt: number;
  iconImage: string | null;
  iconBgColor: string | null;
  seedStarting?: Partial<SeedStartingFields>;
  seasons?: Season[];
  usdaZones?: UsdaZoneRange;
  /** Mature plant height in feet. Optional — used by sun-shading objective. */
  heightFt?: number;
  /** True for vining/climbing cultivars that prefer a trellis edge. */
  climber?: boolean;
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (additive optional fields, no consumers yet).

- [ ] **Step 4: Commit**

```bash
git add src/model/species.ts
git commit -m "feat(model): add optional heightFt and climber to Species"
```

---

### Task 2: Add `heightFt` and `climber` to `Cultivar`

**Files:**
- Modify: `src/model/cultivars.ts:7-55`

- [ ] **Step 1: Add fields to `CultivarRaw` and `Cultivar`**

```ts
interface CultivarRaw {
  id: string;
  speciesId: string;
  variety: string | null;
  color?: string;
  footprintFt?: number;
  spacingFt?: number;
  heightFt?: number;
  climber?: boolean;
  iconImage?: string;
  iconBgColor?: string;
  seedStarting?: Partial<SeedStartingFields>;
}

export interface Cultivar {
  id: string;
  speciesId: string;
  name: string;
  category: CultivarCategory;
  taxonomicName: string;
  variety: string | null;
  color: string;
  footprintFt: number;
  spacingFt: number;
  /** Mature height in feet. Undefined when neither cultivar nor species supplies a value. */
  heightFt: number | undefined;
  climber: boolean;
  iconImage: string | null;
  iconBgColor: string | null;
  seedStarting: SeedStartingFields;
}
```

- [ ] **Step 2: Resolve from species defaults in `resolveCultivar`**

In the returned object literal, add:

```ts
    heightFt: raw.heightFt ?? species.heightFt,
    climber: raw.climber ?? species.climber ?? false,
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Add a test**

In `src/model/cultivars.test.ts` (create if missing) add:

```ts
import { describe, it, expect } from 'vitest';
import { getAllCultivars } from './cultivars';

describe('Cultivar climber/height resolution', () => {
  it('defaults climber to false when unspecified', () => {
    const c = getAllCultivars().find((x) => x.climber === false);
    expect(c).toBeDefined();
  });

  it('exposes heightFt as a number or undefined (never null)', () => {
    for (const c of getAllCultivars()) {
      expect(c.heightFt === undefined || typeof c.heightFt === 'number').toBe(true);
    }
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/model/cultivars.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/model/cultivars.ts src/model/cultivars.test.ts
git commit -m "feat(model): add heightFt and climber to Cultivar with species fallback"
```

---

### Task 3: Add `trellisEdge` to `Structure`

**Files:**
- Modify: `src/model/types.ts:22-42, 151-181`

- [ ] **Step 1: Add field to `Structure` interface**

After `wallThicknessFt: number;`:

```ts
  /** For raised beds: which edge has a trellis attached, if any. Used by trellis-aware strategies and the optimizer. */
  trellisEdge: 'N' | 'E' | 'S' | 'W' | null;
```

- [ ] **Step 2: Default it in `createStructure`**

In the returned object, add `trellisEdge: null,` after `wallThicknessFt`.

- [ ] **Step 3: Add a regression test**

In `src/model/types.test.ts`:

```ts
import { createStructure } from './types';

it('createStructure defaults trellisEdge to null', () => {
  const s = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 8 });
  expect(s.trellisEdge).toBeNull();
});
```

- [ ] **Step 4: Run typecheck and tests**

Run: `npx tsc --noEmit && npx vitest run src/model/types.test.ts`
Expected: PASS. If existing fixtures construct a `Structure` literal directly (not via `createStructure`), TS will complain — fix by adding `trellisEdge: null` to those literals.

- [ ] **Step 5: Sweep test fixtures**

Run: `git grep -l "type: 'raised-bed'" -- 'src/**/*.ts' 'src/**/*.tsx'`

For each file, if it builds a `Structure` object literal manually, add `trellisEdge: null,` next to `wallThicknessFt`. Re-run typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/model/types.ts src/model/types.test.ts $(git diff --name-only)
git commit -m "feat(model): add Structure.trellisEdge (default null)"
```

---

### Task 4: Seed companion/antagonist table

**Files:**
- Create: `src/data/companions.ts`

- [ ] **Step 1: Write the data module**

```ts
/**
 * Curated seed table of companion and antagonist relationships.
 * Lookup is symmetric — getRelation('a', 'b') === getRelation('b', 'a').
 *
 * This is intentionally small; missing pairs return null and the optimizer
 * treats them as neutral. Expand over time.
 */

export type CompanionRelation = 'companion' | 'antagonist';

interface PairRow {
  a: string;
  b: string;
  rel: CompanionRelation;
}

const PAIRS: PairRow[] = [
  { a: 'tomato', b: 'basil', rel: 'companion' },
  { a: 'tomato', b: 'carrot', rel: 'companion' },
  { a: 'tomato', b: 'brassica', rel: 'antagonist' },
  { a: 'carrot', b: 'onion', rel: 'companion' },
  { a: 'carrot', b: 'dill', rel: 'antagonist' },
  { a: 'lettuce', b: 'radish', rel: 'companion' },
  { a: 'cucumber', b: 'nasturtium', rel: 'companion' },
  { a: 'cucumber', b: 'sage', rel: 'antagonist' },
  { a: 'beans', b: 'corn', rel: 'companion' },
  { a: 'beans', b: 'onion', rel: 'antagonist' },
  { a: 'pepper', b: 'basil', rel: 'companion' },
  { a: 'squash', b: 'corn', rel: 'companion' },
  { a: 'squash', b: 'beans', rel: 'companion' },
  { a: 'brassica', b: 'dill', rel: 'companion' },
  { a: 'brassica', b: 'strawberry', rel: 'antagonist' },
  { a: 'spinach', b: 'strawberry', rel: 'companion' },
  { a: 'onion', b: 'pea', rel: 'antagonist' },
  { a: 'pea', b: 'carrot', rel: 'companion' },
  { a: 'pea', b: 'corn', rel: 'companion' },
  { a: 'beet', b: 'onion', rel: 'companion' },
  { a: 'beet', b: 'pole-bean', rel: 'antagonist' },
  { a: 'asparagus', b: 'tomato', rel: 'companion' },
  { a: 'celery', b: 'leek', rel: 'companion' },
  { a: 'leek', b: 'carrot', rel: 'companion' },
  { a: 'corn', b: 'tomato', rel: 'antagonist' },
  { a: 'fennel', b: 'tomato', rel: 'antagonist' },
  { a: 'fennel', b: 'beans', rel: 'antagonist' },
  { a: 'garlic', b: 'lettuce', rel: 'companion' },
  { a: 'garlic', b: 'pea', rel: 'antagonist' },
  { a: 'mint', b: 'cabbage', rel: 'companion' },
];

const map = new Map<string, CompanionRelation>();
for (const { a, b, rel } of PAIRS) {
  map.set(`${a}|${b}`, rel);
  map.set(`${b}|${a}`, rel);
}

/** Look up the relationship between two species or category keys. Returns null when no pair is defined. */
export function getRelation(a: string, b: string): CompanionRelation | null {
  return map.get(`${a}|${b}`) ?? null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/companions.ts
git commit -m "feat(data): seed companion/antagonist table"
```

---

### Task 5: Write `cultivarSpacing.ts` resolvers (TDD)

**Files:**
- Create: `src/model/cultivarSpacing.ts`
- Create: `src/model/cultivarSpacing.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  defaultPitchFor,
  squareFootCountFor,
  defaultClearanceFor,
  companions,
} from './cultivarSpacing';
import type { Cultivar } from './cultivars';

const c = (over: Partial<Cultivar>): Cultivar => ({
  id: 'x',
  speciesId: 'tomato',
  name: 'x',
  category: 'vegetables',
  taxonomicName: 'X',
  variety: null,
  color: '#000',
  footprintFt: 1,
  spacingFt: 1,
  heightFt: undefined,
  climber: false,
  iconImage: null,
  iconBgColor: null,
  seedStarting: {} as never,
  ...over,
});

describe('defaultPitchFor', () => {
  it('returns footprintFt × 2 when footprintFt is present', () => {
    expect(defaultPitchFor(c({ footprintFt: 0.5 }))).toBe(1);
  });

  it('falls back per category when footprintFt is 0', () => {
    expect(defaultPitchFor(c({ footprintFt: 0, category: 'root-vegetables' }))).toBeGreaterThan(0);
  });
});

describe('squareFootCountFor', () => {
  it('buckets large footprint to 1', () => {
    expect(squareFootCountFor(c({ footprintFt: 1.5 }))).toBe(1);
  });
  it('buckets small footprint to 16', () => {
    expect(squareFootCountFor(c({ footprintFt: 0.2 }))).toBe(16);
  });
  it('returns 1 | 4 | 9 | 16 only', () => {
    for (const fp of [0.1, 0.3, 0.5, 0.8, 1.2, 2.0]) {
      expect([1, 4, 9, 16]).toContain(squareFootCountFor(c({ footprintFt: fp })));
    }
  });
});

describe('defaultClearanceFor', () => {
  it('returns 0 by default', () => {
    expect(defaultClearanceFor(c({}))).toBe(0);
  });
});

describe('companions', () => {
  it('symmetric lookup against the seed table', () => {
    const a = c({ speciesId: 'tomato' });
    const b = c({ speciesId: 'basil' });
    expect(companions(a, b)).toBe('companion');
    expect(companions(b, a)).toBe('companion');
  });

  it('returns null for unknown pairs', () => {
    const a = c({ speciesId: 'aardvark' });
    const b = c({ speciesId: 'badger' });
    expect(companions(a, b)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/model/cultivarSpacing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { Cultivar, CultivarCategory } from './cultivars';
import { getRelation, type CompanionRelation } from '../data/companions';

const CATEGORY_FALLBACK_PITCH_FT: Record<CultivarCategory, number> = {
  herbs: 0.75,
  vegetables: 1.0,
  greens: 0.5,
  fruits: 1.5,
  squash: 3.0,
  flowers: 0.75,
  'root-vegetables': 0.33,
  legumes: 0.5,
};

export function defaultPitchFor(cultivar: Cultivar): number {
  if (cultivar.footprintFt > 0) return cultivar.footprintFt * 2;
  return CATEGORY_FALLBACK_PITCH_FT[cultivar.category];
}

export function squareFootCountFor(cultivar: Cultivar): 1 | 4 | 9 | 16 {
  const fp = cultivar.footprintFt;
  if (fp >= 1.0) return 1;
  if (fp >= 0.5) return 4;
  if (fp >= 0.33) return 9;
  return 16;
}

export function defaultClearanceFor(_cultivar: Cultivar): number {
  return 0;
}

export function companions(a: Cultivar, b: Cultivar): CompanionRelation | null {
  return getRelation(a.speciesId, b.speciesId);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/model/cultivarSpacing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model/cultivarSpacing.ts src/model/cultivarSpacing.test.ts
git commit -m "feat(model): add cultivarSpacing resolvers (pitch, sq-ft count, companions)"
```

---

### Task 6: Document behavior + update TODO

**Files:**
- Modify: `docs/behavior.md`
- Modify: `docs/TODO.md`

- [ ] **Step 1: Add behavior notes**

Append to `docs/behavior.md`:

```
- Cultivars expose optional `heightFt` and `climber` fields. When unspecified, `heightFt` is undefined and `climber` defaults to false.
- Raised beds expose `trellisEdge: 'N'|'E'|'S'|'W'|null`, default null.
- `cultivarSpacing` derives default pitch and square-foot bucket counts from cultivar metadata; falls back to category defaults when footprint is missing.
```

- [ ] **Step 2: Update TODO**

In `docs/TODO.md`, add:

```
- [ ] Expand companion/antagonist table beyond the v1 seed (~30 pairs in `src/data/companions.ts`). Source: extension-service publications, vetted gardening references.
```

- [ ] **Step 3: Run full build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/behavior.md docs/TODO.md
git commit -m "docs: note groundwork model fields and companion-table TODO"
```

---

## Self-Review Checklist (already done)

- Spec coverage: every shared field referenced by Plan 1 / Plan 2 lands here. ✓
- No placeholders. ✓
- Type consistency: `Cultivar.heightFt` is `number | undefined`, used identically in Plans 1 and 2. ✓
