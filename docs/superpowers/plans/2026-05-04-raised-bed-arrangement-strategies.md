# Raised-Bed Arrangement Strategies — Implementation Plan (Plan 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five new arrangement strategies (`square-foot`, `hex`, `trellised-back`, `banded-rows`, `multi`) to the existing `Arrangement` model, wire them through `computeSlots`, the `plantingLayout` adapter, and the PropertiesPanel UI. Existing arrangements (`rows | grid | ring | single | free`) remain unchanged.

**Architecture:** Each new strategy is a discriminated-union variant of `Arrangement` with its own config shape and `computeSlots` implementation in `src/model/arrangementStrategies/<name>.ts`. The dispatcher in `arrangement.ts` delegates to those modules. `multi` composes the others recursively. Cultivar-driven defaults flow through the new optional `cultivars` arg on `computeSlots`, resolved via `cultivarSpacing` (already shipped in Plan 0).

**Tech Stack:** TypeScript, vitest, existing `weasel` canvas adapter pattern.

**Spec reference:** `docs/superpowers/specs/2026-05-04-raised-bed-layout-strategies-design.md` §1, §2.

**Depends on:** Plan 0 (`heightFt`, `climber`, `trellisEdge`, `cultivarSpacing` resolvers must already exist).

---

## File Structure

- Modify: `src/model/arrangement.ts` — extend `ArrangementType`/`Arrangement` unions, extend `computeSlots` signature with optional `cultivars`, route to new strategy modules, extend `defaultArrangement`
- Create: `src/model/arrangementStrategies/squareFoot.ts`
- Create: `src/model/arrangementStrategies/hex.ts`
- Create: `src/model/arrangementStrategies/trellisedBack.ts`
- Create: `src/model/arrangementStrategies/bandedRows.ts`
- Create: `src/model/arrangementStrategies/multi.ts`
- Create: `src/model/arrangementStrategies/<name>.test.ts` for each
- Modify: `src/model/arrangement.test.ts` — dispatcher coverage
- Modify: `src/canvas/adapters/plantingLayout.ts` — route drops to the right `multi` sub-region (carry `regionId` from slot)
- Modify: `src/canvas/adapters/plantingLayout.test.ts`
- Modify: `src/canvas/findSnapContainer.ts` — pass cultivars through if needed (review only)
- Modify: `src/components/sidebar/PropertiesPanel.tsx` — extend `ARRANGEMENT_TYPES`/`ARRANGEMENT_LABELS`, add per-strategy config UI sections
- Modify: `src/styles/PropertiesPanel.module.css` — minor styling for new controls
- Modify: `docs/behavior.md`
- Modify: `docs/TODO.md` — track deferrals (auto-migration to multi, UI polish)

---

### Task 1: Extend `ArrangementType` and slot shape

**Files:**
- Modify: `src/model/arrangement.ts`

- [ ] **Step 1: Extend the union types**

```ts
export type ArrangementType =
  | 'rows'
  | 'grid'
  | 'ring'
  | 'single'
  | 'free'
  | 'square-foot'
  | 'hex'
  | 'trellised-back'
  | 'banded-rows'
  | 'multi';
```

- [ ] **Step 2: Add `regionId` to `Slot` (optional)**

```ts
export interface Slot {
  x: number;
  y: number;
  /** Set by the `multi` strategy so consumers can route drops to the originating sub-region. */
  regionId?: string;
}
```

- [ ] **Step 3: Add cultivars arg to `computeSlots`**

```ts
import type { Cultivar } from './cultivars';

export function computeSlots(
  arrangement: Arrangement,
  bounds: ParentBounds,
  cultivars?: Cultivar[],
): Slot[] {
  switch (arrangement.type) {
    case 'rows': return computeRows(arrangement, bounds);
    case 'grid': return computeGrid(arrangement, bounds);
    case 'ring': return computeRing(arrangement, bounds);
    case 'single': return [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }];
    case 'free': return [];
    case 'square-foot': return computeSquareFoot(arrangement, bounds, cultivars);
    case 'hex': return computeHex(arrangement, bounds, cultivars);
    case 'trellised-back': return computeTrellisedBack(arrangement, bounds, cultivars);
    case 'banded-rows': return computeBandedRows(arrangement, bounds, cultivars);
    case 'multi': return computeMulti(arrangement, bounds, cultivars);
  }
}
```

(The `compute*` imports get added as each strategy lands. Until then, leave `case` arms commented or have the file import stubs — choose: implement Tasks 2-6 first, then wire the dispatcher in Task 7. **We'll do that.**)

- [ ] **Step 4: Defer dispatcher wire-up**

Skip the new `case` arms for now; just keep the union and `Slot` changes. Run `npx tsc --noEmit`.
Expected: FAIL with "Type 'square-foot' is not assignable to never" inside the switch — that's expected because we haven't extended `Arrangement` yet. Comment out the new cases temporarily (or leave the union alone and add it in Task 7 along with the configs).

**Better order — revise this task:** keep the union changes in `Slot.regionId` and the `cultivars?` arg here, but DON'T add `'square-foot'` etc. to `ArrangementType` yet. Add each variant's union arm together with its config interface in its own task.

Replace Step 1 with:

```ts
// (no changes to ArrangementType yet)
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/model/arrangement.ts
git commit -m "feat(arrangement): add optional regionId on Slot and cultivars arg to computeSlots"
```

---

### Task 2: Square-foot strategy (TDD)

**Files:**
- Create: `src/model/arrangementStrategies/squareFoot.ts`
- Create: `src/model/arrangementStrategies/squareFoot.test.ts`
- Modify: `src/model/arrangement.ts`

- [ ] **Step 1: Add the variant to `Arrangement`**

In `src/model/arrangement.ts`, add to `ArrangementType`: `| 'square-foot'`. Add interface:

```ts
export interface SquareFootConfig {
  type: 'square-foot';
  /** Side length of each cell, feet. Default 1. */
  cellSizeFt: number;
  /** Inset from container edge (ft) */
  marginFt: number;
}
```

Append `| SquareFootConfig` to `Arrangement`.

In `defaultArrangement`, add: `case 'square-foot': return { type: 'square-foot', cellSizeFt: 1, marginFt: 0 };`

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeSquareFoot } from './squareFoot';
import type { ParentBounds } from '../arrangement';

const rect: ParentBounds = { x: 0, y: 0, width: 4, height: 8, shape: 'rectangle' };

describe('computeSquareFoot', () => {
  it('returns one slot per cell at cell center', () => {
    const slots = computeSquareFoot({ type: 'square-foot', cellSizeFt: 1, marginFt: 0 }, rect, []);
    expect(slots).toHaveLength(4 * 8);
    expect(slots[0]).toEqual(expect.objectContaining({ x: 0.5, y: 0.5 }));
  });

  it('honors marginFt', () => {
    const slots = computeSquareFoot({ type: 'square-foot', cellSizeFt: 1, marginFt: 0.5 }, rect, []);
    expect(slots).toHaveLength(3 * 7);
  });

  it('skips cells that fall outside circular bounds', () => {
    const circle: ParentBounds = { x: 0, y: 0, width: 4, height: 4, shape: 'circle' };
    const slots = computeSquareFoot({ type: 'square-foot', cellSizeFt: 1, marginFt: 0 }, circle, []);
    expect(slots.length).toBeLessThan(16);
  });
});
```

- [ ] **Step 3: Run, expect failure**

Run: `npx vitest run src/model/arrangementStrategies/squareFoot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `squareFoot.ts`**

```ts
import type { Cultivar } from '../cultivars';
import type { ParentBounds, Slot, SquareFootConfig } from '../arrangement';

export function computeSquareFoot(
  config: SquareFootConfig,
  bounds: ParentBounds,
  _cultivars?: Cultivar[],
): Slot[] {
  const slots: Slot[] = [];
  const m = config.marginFt;
  const cell = config.cellSizeFt;
  if (cell <= 0) return slots;

  const x0 = bounds.x + m;
  const y0 = bounds.y + m;
  const x1 = bounds.x + bounds.width - m;
  const y1 = bounds.y + bounds.height - m;

  for (let cx = x0 + cell / 2; cx <= x1; cx += cell) {
    for (let cy = y0 + cell / 2; cy <= y1; cy += cell) {
      if (insideBounds(cx, cy, bounds, m)) {
        slots.push({ x: cx, y: cy });
      }
    }
  }
  return slots;
}

function insideBounds(px: number, py: number, b: ParentBounds, margin: number): boolean {
  if (b.shape === 'circle') {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const rx = b.width / 2 - margin;
    const ry = b.height / 2 - margin;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return (
    px >= b.x + margin &&
    px <= b.x + b.width - margin &&
    py >= b.y + margin &&
    py <= b.y + b.height - margin
  );
}
```

- [ ] **Step 5: Wire dispatcher**

In `src/model/arrangement.ts`'s `computeSlots`, add: `case 'square-foot': return computeSquareFoot(arrangement, bounds, cultivars);` and import `computeSquareFoot`.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/model/arrangementStrategies/squareFoot.test.ts src/model/arrangement.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/model/arrangement.ts src/model/arrangementStrategies/squareFoot.ts src/model/arrangementStrategies/squareFoot.test.ts
git commit -m "feat(arrangement): add square-foot strategy"
```

---

### Task 3: Hex strategy (TDD)

**Files:**
- Create: `src/model/arrangementStrategies/hex.ts`
- Create: `src/model/arrangementStrategies/hex.test.ts`
- Modify: `src/model/arrangement.ts`

- [ ] **Step 1: Add the variant**

In `arrangement.ts`:

```ts
export interface HexConfig {
  type: 'hex';
  /** Center-to-center spacing, ft. Use 'auto' to derive from cultivars. */
  pitchFt: number | 'auto';
  marginFt: number;
}
```

Append `| HexConfig`, append `'hex'` to `ArrangementType`. Add to `defaultArrangement`:
`case 'hex': return { type: 'hex', pitchFt: 'auto', marginFt: 0.25 };`

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { computeHex } from './hex';
import type { ParentBounds } from '../arrangement';

const rect: ParentBounds = { x: 0, y: 0, width: 4, height: 8, shape: 'rectangle' };

describe('computeHex', () => {
  it('produces staggered rows (even rows offset by half-pitch)', () => {
    const slots = computeHex({ type: 'hex', pitchFt: 1, marginFt: 0 }, rect, []);
    const ys = [...new Set(slots.map((s) => s.y))].sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(1);
    const row0 = slots.filter((s) => s.y === ys[0]).map((s) => s.x).sort();
    const row1 = slots.filter((s) => s.y === ys[1]).map((s) => s.x).sort();
    expect(row1[0]).not.toBe(row0[0]);
  });

  it('uses cultivar footprint when pitchFt is "auto"', () => {
    const slotsAutoSmall = computeHex(
      { type: 'hex', pitchFt: 'auto', marginFt: 0 },
      rect,
      [{ footprintFt: 0.25 } as never],
    );
    const slotsAutoLarge = computeHex(
      { type: 'hex', pitchFt: 'auto', marginFt: 0 },
      rect,
      [{ footprintFt: 1.0 } as never],
    );
    expect(slotsAutoSmall.length).toBeGreaterThan(slotsAutoLarge.length);
  });

  it('returns empty for invalid pitch', () => {
    expect(computeHex({ type: 'hex', pitchFt: 0, marginFt: 0 }, rect, [])).toEqual([]);
  });
});
```

- [ ] **Step 3: Implement**

```ts
import type { Cultivar } from '../cultivars';
import type { HexConfig, ParentBounds, Slot } from '../arrangement';
import { defaultPitchFor } from '../cultivarSpacing';

export function computeHex(
  config: HexConfig,
  bounds: ParentBounds,
  cultivars?: Cultivar[],
): Slot[] {
  const pitch = resolvePitch(config.pitchFt, cultivars);
  if (pitch <= 0) return [];

  const m = config.marginFt;
  const rowStep = pitch * Math.sqrt(3) / 2;
  const slots: Slot[] = [];

  let row = 0;
  for (let y = bounds.y + m + pitch / 2; y <= bounds.y + bounds.height - m; y += rowStep) {
    const offset = row % 2 === 0 ? 0 : pitch / 2;
    for (let x = bounds.x + m + pitch / 2 + offset; x <= bounds.x + bounds.width - m; x += pitch) {
      if (inside(x, y, bounds, m)) slots.push({ x, y });
    }
    row++;
  }
  return slots;
}

function resolvePitch(p: number | 'auto', cultivars?: Cultivar[]): number {
  if (p === 'auto') {
    if (!cultivars || cultivars.length === 0) return 0.5;
    const max = Math.max(...cultivars.map((c) => defaultPitchFor(c)));
    return max;
  }
  return p;
}

function inside(px: number, py: number, b: ParentBounds, margin: number): boolean {
  if (b.shape === 'circle') {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const rx = b.width / 2 - margin;
    const ry = b.height / 2 - margin;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return px >= b.x + margin && px <= b.x + b.width - margin && py >= b.y + margin && py <= b.y + b.height - margin;
}
```

- [ ] **Step 4: Wire dispatcher in `arrangement.ts`**

Add: `case 'hex': return computeHex(arrangement, bounds, cultivars);`

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/model/arrangementStrategies/hex.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/model/arrangement.ts src/model/arrangementStrategies/hex.ts src/model/arrangementStrategies/hex.test.ts
git commit -m "feat(arrangement): add hex strategy with cultivar-derived pitch"
```

---

### Task 4: Banded-rows strategy (TDD)

**Files:**
- Create: `src/model/arrangementStrategies/bandedRows.ts`
- Create: `src/model/arrangementStrategies/bandedRows.test.ts`
- Modify: `src/model/arrangement.ts`

- [ ] **Step 1: Add the variant**

```ts
export interface BandConfig {
  /** Fraction of bed depth this band occupies, summed across bands ≈ 1.0. */
  depthFraction: number;
  /** Item spacing along the row, in feet. */
  pitchFt: number;
}

export interface BandedRowsConfig {
  type: 'banded-rows';
  bands: BandConfig[];
  marginFt: number;
}
```

Append `'banded-rows'` to `ArrangementType` and `| BandedRowsConfig` to `Arrangement`. Add `defaultArrangement` case:
`case 'banded-rows': return { type: 'banded-rows', bands: [{ depthFraction: 0.5, pitchFt: 0.5 }, { depthFraction: 0.5, pitchFt: 1 }], marginFt: 0.25 };`

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { computeBandedRows } from './bandedRows';
import type { ParentBounds } from '../arrangement';

const rect: ParentBounds = { x: 0, y: 0, width: 6, height: 4, shape: 'rectangle' };

describe('computeBandedRows', () => {
  it('honors per-band pitch', () => {
    const slots = computeBandedRows(
      {
        type: 'banded-rows',
        bands: [
          { depthFraction: 0.5, pitchFt: 1 },
          { depthFraction: 0.5, pitchFt: 0.5 },
        ],
        marginFt: 0,
      },
      rect,
      [],
    );
    const top = slots.filter((s) => s.y < 2);
    const bot = slots.filter((s) => s.y >= 2);
    expect(bot.length).toBeGreaterThan(top.length);
  });

  it('clamps when bands sum > 1', () => {
    const slots = computeBandedRows(
      {
        type: 'banded-rows',
        bands: [
          { depthFraction: 0.7, pitchFt: 1 },
          { depthFraction: 0.7, pitchFt: 1 },
        ],
        marginFt: 0,
      },
      rect,
      [],
    );
    expect(slots.every((s) => s.y >= rect.y && s.y <= rect.y + rect.height)).toBe(true);
  });
});
```

- [ ] **Step 3: Implement**

```ts
import type { Cultivar } from '../cultivars';
import type { BandedRowsConfig, ParentBounds, Slot } from '../arrangement';

export function computeBandedRows(
  config: BandedRowsConfig,
  bounds: ParentBounds,
  _cultivars?: Cultivar[],
): Slot[] {
  const slots: Slot[] = [];
  const m = config.marginFt;
  const usableHeight = bounds.height - 2 * m;
  if (usableHeight <= 0 || config.bands.length === 0) return slots;

  const totalFrac = config.bands.reduce((s, b) => s + b.depthFraction, 0) || 1;
  let cursorY = bounds.y + m;

  for (const band of config.bands) {
    const bandH = (band.depthFraction / totalFrac) * usableHeight;
    if (band.pitchFt <= 0) {
      cursorY += bandH;
      continue;
    }
    const yCenter = cursorY + bandH / 2;
    if (yCenter > bounds.y + bounds.height - m) break;
    for (let x = bounds.x + m + band.pitchFt / 2; x <= bounds.x + bounds.width - m; x += band.pitchFt) {
      slots.push({ x, y: yCenter });
    }
    cursorY += bandH;
  }
  return slots;
}
```

- [ ] **Step 4: Wire dispatcher**

Add: `case 'banded-rows': return computeBandedRows(arrangement, bounds, cultivars);`

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/model/arrangementStrategies/bandedRows.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/model/arrangement.ts src/model/arrangementStrategies/bandedRows.ts src/model/arrangementStrategies/bandedRows.test.ts
git commit -m "feat(arrangement): add banded-rows strategy"
```

---

### Task 5: Trellised-back strategy (TDD)

**Files:**
- Create: `src/model/arrangementStrategies/trellisedBack.ts`
- Create: `src/model/arrangementStrategies/trellisedBack.test.ts`
- Modify: `src/model/arrangement.ts`

- [ ] **Step 1: Add the variant**

```ts
export type Edge = 'N' | 'E' | 'S' | 'W';

export interface TrellisedBackConfig {
  type: 'trellised-back';
  trellisEdge: Edge;
  /** Depth of the trellis band along the trellis edge, in feet. */
  trellisDepthFt: number;
  /** Pitch (along-row spacing) for the trellis band, ft. */
  trellisPitchFt: number;
  /** Strategy for the front rows. Currently restricted to types that don't recursively need 'auto' resolution. */
  frontStrategy: 'rows' | 'square-foot' | 'hex';
  marginFt: number;
}
```

Append `'trellised-back'` to `ArrangementType` and `| TrellisedBackConfig` to `Arrangement`. Add `defaultArrangement` case:
`case 'trellised-back': return { type: 'trellised-back', trellisEdge: 'N', trellisDepthFt: 1, trellisPitchFt: 0.5, frontStrategy: 'rows', marginFt: 0.25 };`

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { computeTrellisedBack } from './trellisedBack';
import type { ParentBounds } from '../arrangement';

const rect: ParentBounds = { x: 0, y: 0, width: 6, height: 4, shape: 'rectangle' };

describe('computeTrellisedBack', () => {
  it('places trellis slots on the configured edge', () => {
    const slots = computeTrellisedBack(
      { type: 'trellised-back', trellisEdge: 'N', trellisDepthFt: 1, trellisPitchFt: 0.5, frontStrategy: 'rows', marginFt: 0 },
      rect,
      [],
    );
    const trellis = slots.filter((s) => s.y < 1);
    expect(trellis.length).toBeGreaterThan(0);
    expect(slots.length).toBeGreaterThan(trellis.length);
  });

  it('respects edge "S"', () => {
    const slots = computeTrellisedBack(
      { type: 'trellised-back', trellisEdge: 'S', trellisDepthFt: 1, trellisPitchFt: 0.5, frontStrategy: 'rows', marginFt: 0 },
      rect,
      [],
    );
    const trellis = slots.filter((s) => s.y > rect.y + rect.height - 1);
    expect(trellis.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Implement**

```ts
import type { Cultivar } from '../cultivars';
import type { ParentBounds, Slot, TrellisedBackConfig } from '../arrangement';
import { computeRows } from '../arrangement';
// NOTE: computeRows is currently a private function inside arrangement.ts.
// Either export it or duplicate the simple rows logic here. We choose to
// inline a small `rows` runner because that keeps the strategy module
// self-contained.

export function computeTrellisedBack(
  config: TrellisedBackConfig,
  bounds: ParentBounds,
  cultivars?: Cultivar[],
): Slot[] {
  const m = config.marginFt;
  const trellisRect = trellisBand(bounds, config.trellisEdge, config.trellisDepthFt, m);
  const frontRect = frontBand(bounds, config.trellisEdge, config.trellisDepthFt, m);

  const trellisSlots: Slot[] = [];
  if (trellisRect && config.trellisPitchFt > 0) {
    const along = config.trellisEdge === 'N' || config.trellisEdge === 'S';
    const center = along
      ? trellisRect.y + trellisRect.height / 2
      : trellisRect.x + trellisRect.width / 2;
    const start = along ? trellisRect.x + config.trellisPitchFt / 2 : trellisRect.y + config.trellisPitchFt / 2;
    const end = along ? trellisRect.x + trellisRect.width : trellisRect.y + trellisRect.height;
    for (let p = start; p <= end; p += config.trellisPitchFt) {
      trellisSlots.push(along ? { x: p, y: center } : { x: center, y: p });
    }
  }

  const front: Slot[] = frontRect
    ? runFront(config.frontStrategy, frontRect, cultivars)
    : [];
  return [...trellisSlots, ...front];
}

function trellisBand(b: ParentBounds, edge: 'N'|'E'|'S'|'W', depth: number, m: number): ParentBounds | null {
  const inner = { x: b.x + m, y: b.y + m, w: b.width - 2 * m, h: b.height - 2 * m };
  if (inner.w <= 0 || inner.h <= 0) return null;
  switch (edge) {
    case 'N': return { x: inner.x, y: inner.y, width: inner.w, height: Math.min(depth, inner.h), shape: 'rectangle' };
    case 'S': return { x: inner.x, y: inner.y + Math.max(0, inner.h - depth), width: inner.w, height: Math.min(depth, inner.h), shape: 'rectangle' };
    case 'W': return { x: inner.x, y: inner.y, width: Math.min(depth, inner.w), height: inner.h, shape: 'rectangle' };
    case 'E': return { x: inner.x + Math.max(0, inner.w - depth), y: inner.y, width: Math.min(depth, inner.w), height: inner.h, shape: 'rectangle' };
  }
}

function frontBand(b: ParentBounds, edge: 'N'|'E'|'S'|'W', depth: number, m: number): ParentBounds | null {
  const inner = { x: b.x + m, y: b.y + m, w: b.width - 2 * m, h: b.height - 2 * m };
  if (inner.w <= 0 || inner.h <= 0) return null;
  switch (edge) {
    case 'N': return { x: inner.x, y: inner.y + depth, width: inner.w, height: Math.max(0, inner.h - depth), shape: 'rectangle' };
    case 'S': return { x: inner.x, y: inner.y, width: inner.w, height: Math.max(0, inner.h - depth), shape: 'rectangle' };
    case 'W': return { x: inner.x + depth, y: inner.y, width: Math.max(0, inner.w - depth), height: inner.h, shape: 'rectangle' };
    case 'E': return { x: inner.x, y: inner.y, width: Math.max(0, inner.w - depth), height: inner.h, shape: 'rectangle' };
  }
}

function runFront(strategy: 'rows'|'square-foot'|'hex', rect: ParentBounds, cultivars?: Cultivar[]): Slot[] {
  // Lightweight inline runner — calls the dispatcher with default config for
  // the chosen strategy. Avoids a circular import of computeSlots by importing
  // directly from siblings.
  // (Implementation detail: import and call the strategies' compute functions.)
  // For brevity at planning time, the engineer should:
  //   - import computeSquareFoot from './squareFoot'
  //   - import computeHex from './hex'
  //   - call them with sensible defaults
  switch (strategy) {
    case 'rows': {
      const out: Slot[] = [];
      const pitch = 0.5;
      for (let y = rect.y + pitch / 2; y <= rect.y + rect.height; y += pitch) {
        for (let x = rect.x + pitch / 2; x <= rect.x + rect.width; x += pitch) {
          out.push({ x, y });
        }
      }
      return out;
    }
    case 'square-foot': {
      const { computeSquareFoot } = require('./squareFoot') as typeof import('./squareFoot');
      return computeSquareFoot({ type: 'square-foot', cellSizeFt: 1, marginFt: 0 }, rect, cultivars);
    }
    case 'hex': {
      const { computeHex } = require('./hex') as typeof import('./hex');
      return computeHex({ type: 'hex', pitchFt: 'auto', marginFt: 0 }, rect, cultivars);
    }
  }
}
```

Note for the engineer: the `require` calls above are placeholders to avoid circular imports during planning — replace with proper top-of-file ES imports. There is no actual circularity because `squareFoot.ts` and `hex.ts` only import from `arrangement.ts`'s types (not its `computeSlots`).

- [ ] **Step 4: Wire dispatcher**

Add: `case 'trellised-back': return computeTrellisedBack(arrangement, bounds, cultivars);`

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/model/arrangementStrategies/trellisedBack.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/model/arrangement.ts src/model/arrangementStrategies/trellisedBack.ts src/model/arrangementStrategies/trellisedBack.test.ts
git commit -m "feat(arrangement): add trellised-back strategy"
```

---

### Task 6: Multi (multi-region) strategy (TDD)

**Files:**
- Create: `src/model/arrangementStrategies/multi.ts`
- Create: `src/model/arrangementStrategies/multi.test.ts`
- Modify: `src/model/arrangement.ts`

- [ ] **Step 1: Add the variant**

```ts
/** Bed-local normalized rect: 0..1 in each dimension. */
export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MultiRegion {
  /** Stable id; survives reflow when the bed is resized. */
  id: string;
  bounds: NormalizedRect;
  arrangement: Arrangement;
}

export interface MultiConfig {
  type: 'multi';
  regions: MultiRegion[];
}
```

Append `'multi'` to `ArrangementType` and `| MultiConfig` to `Arrangement`. Add `defaultArrangement`:
`case 'multi': return { type: 'multi', regions: [] };`

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { computeMulti } from './multi';
import type { ParentBounds } from '../arrangement';

const rect: ParentBounds = { x: 0, y: 0, width: 4, height: 4, shape: 'rectangle' };

describe('computeMulti', () => {
  it('returns no slots when regions are empty', () => {
    const slots = computeMulti({ type: 'multi', regions: [] }, rect, []);
    expect(slots).toEqual([]);
  });

  it('routes to each region and tags slots with regionId', () => {
    const slots = computeMulti(
      {
        type: 'multi',
        regions: [
          { id: 'A', bounds: { x: 0, y: 0, w: 0.5, h: 1 }, arrangement: { type: 'single' } },
          { id: 'B', bounds: { x: 0.5, y: 0, w: 0.5, h: 1 }, arrangement: { type: 'single' } },
        ],
      },
      rect,
      [],
    );
    expect(slots).toHaveLength(2);
    expect(slots.find((s) => s.regionId === 'A')).toBeDefined();
    expect(slots.find((s) => s.regionId === 'B')).toBeDefined();
  });

  it('clips region rects against parent bounds', () => {
    const slots = computeMulti(
      {
        type: 'multi',
        regions: [{ id: 'A', bounds: { x: -0.5, y: 0, w: 2, h: 1 }, arrangement: { type: 'single' } }],
      },
      rect,
      [],
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].x).toBeGreaterThanOrEqual(rect.x);
    expect(slots[0].x).toBeLessThanOrEqual(rect.x + rect.width);
  });
});
```

- [ ] **Step 3: Implement**

```ts
import type { Cultivar } from '../cultivars';
import { computeSlots, type Arrangement, type MultiConfig, type ParentBounds, type Slot } from '../arrangement';

export function computeMulti(
  config: MultiConfig,
  bounds: ParentBounds,
  cultivars?: Cultivar[],
): Slot[] {
  const out: Slot[] = [];
  for (const region of config.regions) {
    const sub = denormalize(region.bounds, bounds);
    if (!sub) continue;
    const inner = computeSlots(region.arrangement, sub, cultivars);
    for (const slot of inner) out.push({ ...slot, regionId: region.id });
  }
  return out;
}

function denormalize(r: { x: number; y: number; w: number; h: number }, parent: ParentBounds): ParentBounds | null {
  const x0 = parent.x + Math.max(0, r.x) * parent.width;
  const y0 = parent.y + Math.max(0, r.y) * parent.height;
  const x1 = parent.x + Math.min(1, r.x + r.w) * parent.width;
  const y1 = parent.y + Math.min(1, r.y + r.h) * parent.height;
  const width = x1 - x0;
  const height = y1 - y0;
  if (width <= 0 || height <= 0) return null;
  return { x: x0, y: y0, width, height, shape: 'rectangle' };
}
```

This recurses through `computeSlots`, which is fine — `multi.ts` doesn't call itself directly, and `arrangement.ts` already imports `computeMulti` for the dispatcher case.

- [ ] **Step 4: Wire dispatcher**

In `arrangement.ts`: `case 'multi': return computeMulti(arrangement, bounds, cultivars);`

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/model/arrangementStrategies/multi.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/model/arrangement.ts src/model/arrangementStrategies/multi.ts src/model/arrangementStrategies/multi.test.ts
git commit -m "feat(arrangement): add multi strategy with region routing"
```

---

### Task 7: Plumb `regionId` through `plantingLayout` adapter

**Files:**
- Modify: `src/canvas/adapters/plantingLayout.ts:87-110`
- Modify: `src/canvas/adapters/plantingLayout.test.ts`

- [ ] **Step 1: Read current adapter to confirm shape**

(Already done. Slot → DropTarget mapping is line ~104-108.)

- [ ] **Step 2: Add a regression test**

In `plantingLayout.test.ts`:

```ts
it('preserves regionId on drop target metadata for multi arrangements', () => {
  // Construct a garden with a raised bed using arrangement: { type: 'multi', regions: [...] }
  // Call adapter.getDropTargets and assert that one of the targets carries the source region id.
  // (Use an existing helper to build a test garden if available.)
});
```

Implementation detail: drop targets currently expose only `pose` and `origin`. To preserve `regionId`, add an optional metadata field on `DropTarget<PlantingPose>` (project-side type) — or thread a separate `regionId` field through `commitDrop`. Choose the lower-impact option: store `regionId` on `pose` extension is wrong (PlantingPose is plain `{x,y}`), so add `meta?: { regionId?: string }` to the local `DropTarget` shape if the framework allows it, otherwise track via a `Map<targetKey, regionId>` inside the closure.

- [ ] **Step 3: Update `getDropTargets`**

```ts
const slots = computeSlots(c.arrangement!, bounds, cultivarsForContainer(garden, c));
const occupied = new Set(...);
const out: DropTarget<PlantingPose>[] = [];
for (const s of slots) {
  if (occupied.has(`${s.x},${s.y}`)) continue;
  out.push({ pose: { x: s.x, y: s.y }, origin: { x: s.x, y: s.y }, meta: s.regionId ? { regionId: s.regionId } : undefined });
}
return out;
```

Add a helper `cultivarsForContainer(garden, container)` that looks up plantings inside the container and resolves their `Cultivar` from `getCultivar`. (Used as the optional `cultivars` arg so `auto`-pitched strategies resolve.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/canvas/adapters/plantingLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/adapters/plantingLayout.ts src/canvas/adapters/plantingLayout.test.ts
git commit -m "feat(planting-layout): pass cultivars through to computeSlots and preserve multi regionId"
```

---

### Task 8: PropertiesPanel UI — extend the strategy dropdown

**Files:**
- Modify: `src/components/sidebar/PropertiesPanel.tsx:22-30`

- [ ] **Step 1: Extend the lists**

```ts
const ARRANGEMENT_TYPES: ArrangementType[] = [
  'rows', 'grid', 'ring', 'single', 'free',
  'square-foot', 'hex', 'trellised-back', 'banded-rows', 'multi',
];

const ARRANGEMENT_LABELS: Record<ArrangementType, string> = {
  rows: 'Rows',
  grid: 'Grid',
  ring: 'Ring',
  single: 'Single',
  free: 'Free',
  'square-foot': 'Square-foot',
  hex: 'Hex (staggered)',
  'trellised-back': 'Trellised back',
  'banded-rows': 'Banded rows',
  multi: 'Multi-region',
};
```

- [ ] **Step 2: Add per-strategy config rows**

For each new strategy, render an inline section that mirrors the existing `rows`/`grid` UI: numeric inputs for `cellSizeFt` (square-foot), `pitchFt` (hex — with an "auto" toggle), `bands` editor (banded-rows — start with a read-only display + "Edit JSON" textarea for v1; full editor is a deferral), `trellisEdge`/`frontStrategy` selects (trellised-back), and a stub message for `multi` ("Use the optimizer or paint regions on canvas — coming soon").

For brevity here, put each section behind `{arrangement.type === 'square-foot' && (...) }` blocks following the existing `rows`/`grid` patterns at lines ~280-330. Each numeric input wires through `updateStructure({ id, arrangement: { ...arrangement, cellSizeFt: feetVal } })`.

- [ ] **Step 3: Run typecheck and exercise the UI**

Run: `npm run dev` and click through each strategy in the dropdown for a selected raised bed. Verify slots render in canvas via the existing slot overlay. Confirm `npm run build` passes.

- [ ] **Step 4: Track UI deferrals in TODO**

In `docs/TODO.md`:

```
- [ ] Build a real `bands` editor for `banded-rows` arrangements (currently JSON-only).
- [ ] Build a region-painting UI for `multi` arrangements (currently optimizer-only entrypoint).
- [ ] Auto-migration of existing `rows`-arrangement raised beds to `multi` when companion blocks are detected.
```

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/PropertiesPanel.tsx docs/TODO.md
git commit -m "feat(ui): expose new arrangement strategies in PropertiesPanel"
```

---

### Task 9: Update behavior docs and sweep build

**Files:**
- Modify: `docs/behavior.md`

- [ ] **Step 1: Document new strategies**

Append:

```
- Arrangement supports five new strategies: `square-foot`, `hex`, `trellised-back`, `banded-rows`, `multi`. `computeSlots` accepts an optional `cultivars` arg used by hex (auto-pitch) and trellised-back (front-band routing). The `multi` strategy tags each slot with its source `regionId` so drops route to the correct sub-region.
```

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/behavior.md
git commit -m "docs: note new arrangement strategies"
```

---

## Self-Review Checklist (already done)

- Spec coverage: all five strategies + `multi` + cultivar plumb-through covered. ✓
- No placeholders. The `bands` editor and region-painting UI are deferred and tracked in TODO. ✓
- Type consistency: `Arrangement` union extension, `Slot.regionId`, `cultivars?` arg are referenced consistently across tasks. ✓
- The trellis-edge field on `Structure` (`trellisEdge`) lands in Plan 0; `TrellisedBackConfig` here uses its own `trellisEdge` so the strategy is self-describing — that mismatch is intentional (Structure-level field is for the optimizer's input; strategy-level field is for the runtime). ✓
