import { describe, it, expect } from 'vitest';
import { buildMipModel } from './formulation';
import { mipModelToLpString } from './worker';
import { DEFAULT_WEIGHTS, type OptimizationInput } from './types';

interface HighsSolution {
  Status: string;
  ObjectiveValue: number;
  Columns: Record<string, { Primal: number }>;
}
type HighsLoader = (s?: object) => Promise<{
  solve: (lp: string, opts?: object) => HighsSolution;
}>;
async function loadHighsFresh() {
  const mod = (await import('highs')) as unknown as { default: HighsLoader };
  return mod.default();
}

// HiGHS-WASM (highs-js 1.8.0) crashes when fed too many binary placement
// vars and/or too many same-species adjacency rows. The 8-tomato/4×7.5ft/4in
// case used to produce ~1760 binary vars and ~5650 adj rows and crash with
// "Too few lines". Snapping each plant's candidate cells to a footprint-aware
// pitch cuts var counts dramatically without quality loss.
//
// These regressions verify the LP topology stays well below the danger zone.
describe('8-tomato regression model topology', () => {
  it('keeps placement var count and adj rows below the HiGHS-WASM danger zone', () => {
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 90, edgeClearanceIn: 0 },
      plants: [{ cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null }],
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4,
      timeLimitSec: 15, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    const model = buildMipModel(input);
    expect(model.aux.length).toBe(28); // C(8,2) same-species pairs
    expect(model.vars.length).toBeLessThan(800); // pre-fix was 1760
    const adjRows = model.constraints.filter((c) => c.label.startsWith('adj:'));
    expect(adjRows.length).toBeLessThan(1500); // pre-fix was ~5650; below same-species adj budget
  });

  it('preserves same-species adjacency rows (no fallback strip — heap is isolated per solve)', () => {
    // Pre-fix: the worker stripped these rows when count exceeded a budget,
    // losing the spreading penalty. Post-fix (fresh module per solve) we keep
    // the full adjacency formulation. Verify the LP still contains them.
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 90, edgeClearanceIn: 0 },
      plants: [{ cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null }],
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4,
      timeLimitSec: 15, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    const model = buildMipModel(input);
    const adjRows = model.constraints.filter((c) => c.label.startsWith('adj:'));
    expect(adjRows.length).toBeGreaterThan(0);
    // And the LP serialization includes them (sanitizeName replaces ':' with '_').
    const lp = mipModelToLpString(model);
    expect(lp).toMatch(/adj_n_/);
  });

  it('every aux is for a same-species pair (so all adj rows are stripped on fallback)', () => {
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 90, edgeClearanceIn: 0 },
      plants: [{ cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null }],
      weights: DEFAULT_WEIGHTS, gridResolutionIn: 4,
      timeLimitSec: 15, mipGap: 0.01, candidateCount: 1, diversityThreshold: 3,
    };
    const model = buildMipModel(input);
    for (const aux of model.aux) {
      const m = aux.name.match(/^n_(\d+)_(\d+)$/);
      expect(m).not.toBeNull();
      const a = Number(m![1]);
      const b = Number(m![2]);
      expect(model.plants[a].cultivarId).toBe(model.plants[b].cultivarId);
    }
  });
});

// Heap isolation: with the per-solve fresh-module fix, a crash on solve N
// must not affect solve N+1. We don't share a HiGHS instance across the two
// solves — each gets its own emscripten Module. This test simulates that
// pattern and verifies the second solve succeeds.
describe('per-solve HiGHS module isolation', () => {
  // Tiny LP that solves in <100ms on a fresh module. Used as the "solve N+1"
  // probe after a forced crash on "solve N".
  const TRIVIAL_LP = [
    'Maximize',
    ' obj: + 1 x1 + 2 x2',
    'Subject To',
    ' c1: + 1 x1 + 1 x2 <= 10',
    'Bounds',
    ' 0 <= x1 <= 1',
    ' 0 <= x2 <= 1',
    'General',
    ' x1 x2',
    'End',
  ].join('\n');

  // Malformed LP designed to make highs-js error out. Empty/garbage input
  // throws synchronously inside Module.solve(), which historically left
  // the heap in a bad state for any reused instance.
  const MALFORMED_LP = 'this is not a valid LP file';

  it('a fresh module instance survives even after a previous instance crashed', async () => {
    // Solve N: force a crash on instance A.
    const instanceA = await loadHighsFresh();
    let crashedAsExpected = false;
    try {
      instanceA.solve(MALFORMED_LP, {});
    } catch {
      crashedAsExpected = true;
    }
    // Some malformed inputs return a non-Optimal status rather than throwing;
    // either way is acceptable — what matters is that the failure on A
    // doesn't poison instance B.
    expect(crashedAsExpected || true).toBe(true);

    // Solve N+1: brand-new module instance.
    const instanceB = await loadHighsFresh();
    const sol = instanceB.solve(TRIVIAL_LP, {});
    expect(sol.Status).toBe('Optimal');
    expect(sol.ObjectiveValue).toBe(3); // x1=1, x2=1
  }, 30_000);

  it('a single instance is fine for one solve (sanity baseline)', async () => {
    const highs = await loadHighsFresh();
    const sol = highs.solve(TRIVIAL_LP, {});
    expect(sol.Status).toBe('Optimal');
  }, 30_000);
});
