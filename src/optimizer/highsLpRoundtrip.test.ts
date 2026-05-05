import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMipModel } from './formulation';
import { mipModelToLpString } from './worker';
import { DEFAULT_WEIGHTS, type OptimizationInput, type OptimizerPlant } from './types';

// Where the dumped LP gets written for offline inspection. Kept inside the
// repo so we still have it next time we hit a HiGHS-WASM regression.
const LP_DUMP_PATH = resolve(__dirname, '__fixtures__/eight-tomato.lp');

// Reproduces the 8-tomato HiGHS-WASM crash ("Unable to parse solution. Too few lines.")
// outside the browser worker so we can iterate without user-in-the-loop.
//
// Scenario mirrors public/eight-tomatoes.garden:
// - 4ft × 8ft bed (48" × 96")
// - 8 distinct tomato/cherry-tomato cultivars, count=1 each
// - footprint=12in (1ft), spacing=24in (2ft), category=fruits
// - DEFAULT_WEIGHTS, 4in grid, 5s time limit
//
// All 8 plants fall into the same family/companion cluster, and the
// estimated var count stays under MAX_UNIFIED_VARS=1500, so the worker
// solves them as a single unified MIP — exactly what we build here.
function build8TomatoInput(): OptimizationInput {
  const ids = [
    'tomato.san-marzano',
    'tomato.brandywine',
    'tomato.black-krim',
    'tomato.cherokee-purple',
    'tomato.beefsteak',
    'tomato.roma',
    'cherry-tomato.sun-gold',
    'cherry-tomato.grape',
  ];
  const plants: OptimizerPlant[] = ids.map((id) => ({
    cultivarId: id,
    count: 1,
    footprintIn: 12,
    spacingIn: 24,
    heightIn: null,
    climber: false,
    category: 'fruits',
  }));
  return {
    bed: { widthIn: 48, lengthIn: 96, trellis: null, edgeClearanceIn: 0 },
    plants,
    weights: DEFAULT_WEIGHTS,
    gridResolutionIn: 4,
    companions: { pairs: {} },
    userRegions: [],
    timeLimitSec: 5,
    mipGap: 0.01,
    candidateCount: 1,
    diversityThreshold: 3,
  };
}

interface HighsSolution {
  Status: string;
  ObjectiveValue: number;
  Columns: Record<string, { Primal: number }>;
}
type HighsLoader = (s?: object) => Promise<{
  solve: (lp: string, opts?: object) => HighsSolution;
}>;

async function loadHighs() {
  const mod = (await import('highs')) as unknown as { default: HighsLoader };
  return mod.default();
}

interface InspectedPlacement {
  cultivarId: string;
  xIn: number;
  yIn: number;
}

function placementsFromSolution(
  model: ReturnType<typeof buildMipModel>,
  cols: Record<string, { Primal: number }>,
): InspectedPlacement[] {
  const out: InspectedPlacement[] = [];
  for (const v of model.vars) {
    const col = cols[v.name];
    if (!col || col.Primal <= 0.5) continue;
    const cell = model.cells.find((c) => c.i === v.cellI && c.j === v.cellJ);
    if (!cell) continue;
    out.push({
      cultivarId: model.plants[v.plantIdx].cultivarId,
      xIn: cell.xCenterIn,
      yIn: cell.yCenterIn,
    });
  }
  return out;
}

// Pre-solve breakdown: how many vars/aux have nonzero objective coefficients,
// grouped by which term fed them. Tells us which weights actually wire up to
// the model for a given scenario, before HiGHS runs.
function summarizeObjectiveStructure(model: ReturnType<typeof buildMipModel>): string {
  const lines: string[] = [];
  const nonzeroVars = model.vars.filter((v) => v.c !== 0);
  lines.push(`vars: ${model.vars.length} total, ${nonzeroVars.length} with nonzero c (per-cell terms: trellis + region)`);
  if (nonzeroVars.length > 0) {
    const sample = nonzeroVars.slice(0, 3).map((v) => `${v.name}=${v.c.toFixed(3)}`).join(', ');
    lines.push(`  e.g. ${sample}`);
  }

  // Categorize aux by which pair-term contributed (we re-derive from name; the
  // c is already the sum of contributions, so this is a presence check).
  const auxByCat = { companion: 0, antagonist: 0, sameSpecies: 0, shading: 0, mixed: 0 };
  for (const a of model.aux) {
    const m = a.name.match(/^n_(\d+)_(\d+)$/);
    if (!m) continue;
    const i = Number(m[1]);
    const j = Number(m[2]);
    const pa = model.plants[i];
    const pb = model.plants[j];
    const sameSpecies = pa.cultivarId === pb.cultivarId;
    const hasShading = pa.heightIn != null && pb.heightIn != null && pa.heightIn !== pb.heightIn;
    const tags: string[] = [];
    if (sameSpecies) tags.push('sameSpecies');
    if (hasShading) tags.push('shading');
    if (tags.length === 1) auxByCat[tags[0] as keyof typeof auxByCat]++;
    else if (tags.length > 1) auxByCat.mixed++;
  }
  lines.push(`aux: ${model.aux.length} total — companion=${auxByCat.companion} antagonist=${auxByCat.antagonist} sameSpecies=${auxByCat.sameSpecies} shading=${auxByCat.shading} mixed=${auxByCat.mixed}`);
  return lines.join('\n');
}

// Post-solve: contribution of each model element to the objective at the
// returned solution. Sums coefficients of vars/aux whose Primal is set.
function summarizeObjectiveContribution(
  model: ReturnType<typeof buildMipModel>,
  cols: Record<string, { Primal: number }>,
): string {
  let varSum = 0;
  let auxSum = 0;
  for (const v of model.vars) {
    const col = cols[v.name];
    if (col && col.Primal > 0.5) varSum += v.c;
  }
  for (const a of model.aux) {
    const col = cols[a.name];
    if (col) auxSum += a.c * col.Primal;
  }
  return `obj contribution: vars=${varSum.toFixed(3)} aux=${auxSum.toFixed(3)} total=${(varSum + auxSum).toFixed(3)}`;
}

function summarizePlacements(ps: InspectedPlacement[]): string {
  const lines: string[] = [];
  lines.push(`count=${ps.length}`);
  for (const p of ps) {
    lines.push(`  ${p.cultivarId.padEnd(28)} (${p.xIn.toFixed(1)}, ${p.yIn.toFixed(1)})`);
  }
  // Pairwise nearest-neighbor distances
  const dists: number[] = [];
  for (let i = 0; i < ps.length; i++) {
    let best = Infinity;
    for (let j = 0; j < ps.length; j++) {
      if (i === j) continue;
      const dx = ps[i].xIn - ps[j].xIn;
      const dy = ps[i].yIn - ps[j].yIn;
      best = Math.min(best, Math.hypot(dx, dy));
    }
    dists.push(best);
  }
  if (dists.length > 0) {
    const min = Math.min(...dists).toFixed(1);
    const max = Math.max(...dists).toFixed(1);
    const avg = (dists.reduce((s, d) => s + d, 0) / dists.length).toFixed(1);
    lines.push(`  nearest-neighbor in: min=${min} avg=${avg} max=${max}`);
  }
  return lines.join('\n');
}

describe('HiGHS LP roundtrip — 8-tomato repro', () => {
  it('the unified 8-tomato LP solves under our chosen options', async () => {
    const input = build8TomatoInput();
    const model = buildMipModel(input);
    const lp = mipModelToLpString(model);
    writeFileSync(LP_DUMP_PATH, lp);

    const highs = await loadHighs();
    const sol = highs.solve(lp, { time_limit: 5, mip_rel_gap: 0.01 });
    expect(sol.Status).toBe('Optimal');
  }, 30_000);

  // Useful for tuning weights without a browser in the loop. Runs the solver
  // under DEFAULT_WEIGHTS and prints placement coords + nearest-neighbor stats.
  // Asserts only that the solver placed all 8 plants — the printout is the
  // diagnostic surface.
  it('prints placement diagnostics for the 8-tomato scenario', async () => {
    const input = build8TomatoInput();
    const model = buildMipModel(input);
    const lp = mipModelToLpString(model);
    const highs = await loadHighs();
    const sol = highs.solve(lp, { time_limit: 5, mip_rel_gap: 0.01 });
    expect(sol.Status).toBe('Optimal');
    const placements = placementsFromSolution(model, sol.Columns);
    console.log(`[8-tomato DEFAULT_WEIGHTS] obj=${sol.ObjectiveValue.toFixed(3)}`);
    console.log(summarizeObjectiveStructure(model));
    console.log(summarizeObjectiveContribution(model, sol.Columns));
    console.log(summarizePlacements(placements));
    expect(placements.length).toBe(8);
  }, 30_000);

  // Sweep: for each weight term in isolation, how does the objective and
  // placement geometry change? If a term's effect on placements is identical
  // to the all-zero baseline, it's not actually wired up for this scenario.
  it('weight-isolation sweep on the 8-tomato scenario', async () => {
    const highs = await loadHighs();
    const zero = { shading: 0, companion: 0, antagonist: 0, sameSpeciesBuffer: 0, trellisAttraction: 0, regionPreference: 0 };
    const presets: Array<[string, typeof zero]> = [
      ['all-zero', { ...zero }],
      ['default', { ...DEFAULT_WEIGHTS }],
      ['shading-only', { ...zero, shading: 1 }],
      ['companion-only', { ...zero, companion: 1 }],
      ['sameSpecies-only', { ...zero, sameSpeciesBuffer: 1 }],
      ['trellis-only', { ...zero, trellisAttraction: 1 }],
    ];
    const base = build8TomatoInput();
    for (const [name, w] of presets) {
      const model = buildMipModel({ ...base, weights: w });
      const lp = mipModelToLpString(model);
      const sol = highs.solve(lp, { time_limit: 5, mip_rel_gap: 0.01 });
      const placements = placementsFromSolution(model, sol.Columns);
      const sigxy = placements
        .map((p) => `${p.cultivarId.split('.')[1] ?? p.cultivarId}@(${p.xIn},${p.yIn})`)
        .sort()
        .join(' | ');
      console.log(`[${name}] obj=${sol.ObjectiveValue.toFixed(3)} aux=${model.aux.length} ${summarizeObjectiveContribution(model, sol.Columns)}`);
      console.log(`  ${sigxy}`);
    }
  }, 60_000);

  // highs-js v1.8.0 reads the solution from stdout. Setting either output_flag
  // or log_to_console to false silences that stream and the wrapper then throws
  // "Unable to parse solution. Too few lines." Lock this in so we don't
  // regress by reintroducing those flags.
  it('regression: output_flag=false makes highs-js throw the parse error', async () => {
    const input = build8TomatoInput();
    const lp = mipModelToLpString(buildMipModel(input));
    const highs = await loadHighs();
    expect(() => highs.solve(lp, { time_limit: 5, output_flag: false }))
      .toThrow(/Too few lines/);
  }, 30_000);
});
