import { buildMipModel, estimatePlacementVars } from './formulation';
import { greedyHexPack } from './seed';
import { buildNoGoodCut, perturbWeights } from './diversity';
import { adaptivePartitioner } from './partitioning/adaptive';
import { proportionalStripAllocator } from './allocation/proportionalStrip';
import { refineClusterLayout } from './scoring/postHocRefine';
import type { MipModel } from './formulation';
import type {
  OptimizationInput, OptimizationResult, OptimizationCandidate,
  OptimizerPlacement, Cluster, SubBed,
} from './types';

const MAX_UNIFIED_VARS = 1500;

interface RunMsg { type: 'run'; input: OptimizationInput; id: string }
interface CancelMsg { type: 'cancel'; id: string }
type IncomingMsg = RunMsg | CancelMsg;

interface ProgressMsg { type: 'progress'; id: string; candidate: number; phase: string }
interface DoneMsg { type: 'done'; id: string; result: OptimizationResult }
interface ErrorMsg { type: 'error'; id: string; message: string }
type OutgoingMsg = ProgressMsg | DoneMsg | ErrorMsg;

const cancelled: Record<string, boolean> = {};

self.addEventListener('message', async (e: MessageEvent<IncomingMsg>) => {
  const msg = e.data;
  if (msg.type === 'cancel') { cancelled[msg.id] = true; return; }
  if (msg.type !== 'run') return;
  try {
    const result = await solve(msg.input, (phase, candidate) => {
      post({ type: 'progress', id: msg.id, candidate, phase });
    }, () => cancelled[msg.id]);
    post({ type: 'done', id: msg.id, result });
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  } finally {
    delete cancelled[msg.id];
  }
});

function post(msg: OutgoingMsg) { (self as unknown as Worker).postMessage(msg); }

async function solve(
  input: OptimizationInput,
  onProgress: (phase: string, candidate: number) => void,
  isCancelled: () => boolean,
): Promise<OptimizationResult> {
  const start = performance.now();
  const candidates: OptimizationCandidate[] = [];
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

  // Bypass: no pairwise penalties → MIP would just enforce non-overlap, which
  // hex pack already satisfies. Skip the solver.
  if (model.aux.length === 0) {
    console.info('[optimizer] candidate', n, 'unified bypass: no aux, hex-packing');
    return greedyCandidate(input, performance.now() - solveStart, []);
  }

  const prior = priorActiveByKey.get('unified') ?? [];
  if (n > 0 && prior.length > 0) {
    model.constraints.push({ ...buildNoGoodCut(prior, input.diversityThreshold), label: `nogood:${n}` });
    console.info('[optimizer] candidate', n, 'unified nogood cut: forbid', prior.length, 'prior vars; kDiff:', input.diversityThreshold);
  } else if (n > 0) {
    console.warn('[optimizer] candidate', n, 'unified has no prior to cut against');
  }

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
    // With per-solve fresh module instances, a crash here is a real solver
    // failure (not heap corruption from a prior solve). Surface as a candidate
    // skip rather than silently degrading the spreading penalty.
    console.warn('[optimizer] candidate', n, 'unified solver failed; skipping candidate');
    return null;
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
  const baseClusters = adaptivePartitioner(input);
  if (baseClusters === null) {
    // Adaptive partitioner says "no clustering needed" — e.g. homogeneous
    // input where bucketing would produce a single cluster equal to the
    // input. Fall through to the unified solver and skip the partition /
    // allocate / refine overhead entirely.
    console.info('[optimizer] candidate', n, 'adaptive bypass: single-cluster input → solveUnified');
    return solveUnified(input, n, priorActiveByKey, onProgress, isCancelled);
  }
  const baseSubBeds = proportionalStripAllocator(input.bed, baseClusters);
  const subBeds = splitOversizedSubBeds(baseSubBeds, input);
  const clusters = subBeds.map((s) => s.cluster);

  const allPlacements: OptimizerPlacement[] = [];
  /** Cluster index (into `subBeds`) for each placement in `allPlacements`. */
  const placementClusterIdx: number[] = [];
  let scoreSum = 0;
  let worstGap = 0;
  const fallbackKeys: string[] = [];

  for (let ci = 0; ci < subBeds.length; ci++) {
    const subBed = subBeds[ci];
    if (isCancelled()) return null;
    const subInput = buildSubInput(input, subBed);

    onProgress(`solve cluster ${subBed.cluster.key}`, n);
    const model = buildMipModel(subInput);

    // Bypass per cluster: no pairwise penalties → hex-pack inside this sub-bed.
    if (model.aux.length === 0) {
      console.info('[optimizer] candidate', n, 'cluster', subBed.cluster.key, 'bypass: no aux, hex-packing');
      const greedy = greedyHexPack(subInput);
      for (const gp of greedy) {
        allPlacements.push({
          cultivarId: gp.cultivarId,
          xIn: gp.xIn + subBed.offsetIn.x,
          yIn: gp.yIn + subBed.offsetIn.y,
        });
        placementClusterIdx.push(ci);
      }
      continue;
    }

    const prior = priorActiveByKey.get(subBed.cluster.key) ?? [];
    if (n > 0 && prior.length > 0) {
      model.constraints.push({ ...buildNoGoodCut(prior, subInput.diversityThreshold), label: `nogood:${n}` });
    }

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

    for (const p of subPlacements) {
      allPlacements.push({
        cultivarId: p.cultivarId,
        xIn: p.xIn + subBed.offsetIn.x,
        yIn: p.yIn + subBed.offsetIn.y,
      });
      placementClusterIdx.push(ci);
    }
  }

  if (allPlacements.length === 0) return null;
  const initialRegions = subBeds.map((sb) => ({
    key: sb.cluster.key,
    offsetIn: { x: sb.offsetIn.x, y: sb.offsetIn.y },
    widthIn: sb.bed.widthIn,
    lengthIn: sb.bed.lengthIn,
  }));
  // Post-hoc cluster rotation/swap pass: try to reduce cross-cluster
  // shading + same-species penalties via rigid-body cluster transforms
  // that preserve within-cluster scores. Time-bounded; cheap.
  const footprintByCultivar = new Map<string, number>();
  for (const p of input.plants) {
    if (!footprintByCultivar.has(p.cultivarId)) footprintByCultivar.set(p.cultivarId, p.footprintIn);
  }
  const refined = refineClusterLayout({
    placements: allPlacements,
    placementClusterIdx,
    regions: initialRegions,
    plants: input.plants,
    weights: input.weights,
    footprintByCultivar,
  });
  if (refined.acceptedMoves > 0) {
    console.info(
      '[optimizer] candidate', n, 'post-hoc refine: accepted', refined.acceptedMoves,
      'moves;', 'crossClusterScore', refined.initialCrossClusterScore.toFixed(3),
      '→', refined.finalCrossClusterScore.toFixed(3),
      refined.timedOut ? '(timed out)' : '',
    );
  }
  return {
    placements: refined.placements,
    score: scoreSum,
    reason: clusteredReasonLabel(clusters, refined.placements.length, fallbackKeys),
    gap: worstGap,
    solveMs: performance.now() - solveStart,
    crossClusterScore: refined.finalCrossClusterScore,
    clusterRegions: refined.regions,
  };
}

/**
 * If a sub-bed's cluster still exceeds MAX_UNIFIED_VARS at the strip size,
 * subdivide the strip along its long axis into N pieces and divide each
 * plant's count across the pieces. Splitting at the strip level (rather than
 * the parent bed) keeps each piece geometrically large enough to host the
 * cluster's plants. Handles homogeneous over-large clusters and oversized
 * heterogeneous strips alike.
 */
function splitOversizedSubBeds(subBeds: SubBed[], parent: OptimizationInput): SubBed[] {
  const out: SubBed[] = [];
  for (const subBed of subBeds) {
    const subInput = buildSubInput(parent, subBed);
    const estimate = estimatePlacementVars(subInput);
    if (estimate <= MAX_UNIFIED_VARS) {
      out.push(subBed);
      continue;
    }
    const pieces = Math.ceil(estimate / MAX_UNIFIED_VARS);
    const stripIsHorizontal = subBed.bed.lengthIn >= subBed.bed.widthIn;
    const longAxisLen = stripIsHorizontal ? subBed.bed.lengthIn : subBed.bed.widthIn;
    const pieceLen = longAxisLen / pieces;
    const piecePlantsByIdx = distributeUnitsAcrossPieces(subBed.cluster.plants, pieces);
    for (let i = 0; i < pieces; i++) {
      const piecePlants = piecePlantsByIdx[i];
      if (piecePlants.length === 0) continue;
      const pieceCluster: Cluster = {
        key: `${subBed.cluster.key}#${i + 1}`,
        plants: piecePlants,
      };
      const start = i * pieceLen;
      const pieceBed = stripIsHorizontal
        ? { ...subBed.bed, lengthIn: pieceLen }
        : { ...subBed.bed, widthIn: pieceLen };
      const pieceOffset = stripIsHorizontal
        ? { x: subBed.offsetIn.x, y: subBed.offsetIn.y + start }
        : { x: subBed.offsetIn.x + start, y: subBed.offsetIn.y };
      out.push({ cluster: pieceCluster, bed: pieceBed, offsetIn: pieceOffset });
    }
  }
  for (const sb of out) {
    console.info(
      '[optimizer] split piece', sb.cluster.key,
      'plants:', sb.cluster.plants.length, '(', sb.cluster.plants.reduce((s, p) => s + p.count, 0), 'units)',
      'bed:', sb.bed.widthIn.toFixed(1), '×', sb.bed.lengthIn.toFixed(1),
      'offset:', sb.offsetIn.x.toFixed(1), ',', sb.offsetIn.y.toFixed(1),
    );
  }
  return out;
}

/**
 * Distribute the cluster's "plant units" (one per count) across N pieces so each
 * piece gets a roughly equal slice. Handles both homogeneous many-count clusters
 * (e.g. one plant with count=20) and heterogeneous count=1 clusters (e.g. 8
 * distinct cultivars) — the latter would collapse into a single piece if we
 * naively divided each plant's count by `pieces`.
 */
function distributeUnitsAcrossPieces<T extends { cultivarId: string; count: number }>(
  plants: T[],
  pieces: number,
): T[][] {
  const totalUnits = plants.reduce((s, p) => s + p.count, 0);
  const base = Math.floor(totalUnits / pieces);
  const extra = totalUnits % pieces;
  const result: T[][] = Array.from({ length: pieces }, () => []);
  let pi = 0;
  let cap = base + (0 < extra ? 1 : 0);
  let filled = 0;
  for (const plant of plants) {
    let remaining = plant.count;
    while (remaining > 0 && pi < pieces) {
      if (cap === 0) { pi++; if (pi < pieces) cap = base + (pi < extra ? 1 : 0); filled = 0; continue; }
      const take = Math.min(remaining, cap - filled);
      if (take > 0) {
        const existing = result[pi].find((p) => p.cultivarId === plant.cultivarId);
        if (existing) existing.count += take;
        else result[pi].push({ ...plant, count: take });
        filled += take;
        remaining -= take;
      }
      if (filled >= cap) {
        pi++;
        if (pi < pieces) { cap = base + (pi < extra ? 1 : 0); filled = 0; }
      }
    }
  }
  return result;
}

function buildSubInput(parent: OptimizationInput, subBed: SubBed): OptimizationInput {
  return {
    ...parent,
    bed: subBed.bed,
    plants: subBed.cluster.plants,
  };
}

function solveOpts(input: OptimizationInput) {
  // NOTE: do NOT pass output_flag:false or log_to_console:false. highs-js
  // v1.8.0 parses the solution from stdout; silencing it makes solve() throw
  // "Unable to parse solution. Too few lines." See highsLpRoundtrip.test.ts.
  return {
    time_limit: input.timeLimitSec,
    mip_rel_gap: input.mipGap,
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

/**
 * Instantiate a fresh HiGHS-WASM module per solve.
 *
 * highs-js 1.8.0 has a sharp edge: when a single solve crashes mid-run
 * (table-OOB / "Too few lines" / Aborted()), the emscripten Module's heap
 * state can be corrupted, and any subsequent `solve()` on the same instance
 * may also fail or hang. Creating a fresh Module per solve guarantees heap
 * isolation — each call gets a brand-new linear memory and emscripten
 * runtime, so a crash on solve N cannot affect solve N+1.
 *
 * Cost: ~10–40ms per instantiation (WASM compile + emscripten init). Acceptable
 * given solves typically run hundreds of ms to seconds. The dynamic `import()`
 * results are module-cached so we don't refetch the .js/.wasm bytes — only the
 * Module() factory call is fresh.
 *
 * NOTE: The candidate-level worker pool (see runOptimizer.ts) already isolates
 * heap state across Web Workers. Per-solve isolation here additionally protects
 * the multiple solves that happen *within* a single Worker (multiple
 * candidates, multiple clusters in solveClustered).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadHighs(): Promise<any> {
  const [mod, wasmUrlMod] = await Promise.all([
    import('highs'),
    import('highs/runtime?url'),
  ]);
  const loader = (mod as any).default ?? mod;
  const wasmUrl = (wasmUrlMod as any).default ?? wasmUrlMod;
  // Each loader() invocation creates a NEW emscripten Module — fresh heap,
  // fresh runtime. Do not cache the resolved instance.
  return loader({ locateFile: () => wasmUrl });
}

/**
 * Translate MipModel to CPLEX LP string format for highs.solve().
 * Vars are binary (0/1); aux vars are continuous [0,1].
 * Objective is maximized.
 */
export function mipModelToLpString(model: MipModel): string {
  const lines: string[] = [];

  // Objective
  lines.push('Maximize');
  const objTerms: string[] = [];
  for (const v of model.vars) {
    if (v.c !== 0) {
      objTerms.push(`${formatCoeff(v.c)} ${sanitizeName(v.name)}`);
    }
  }
  for (const a of model.aux) {
    if (a.c !== 0) {
      objTerms.push(`${formatCoeff(a.c)} ${sanitizeName(a.name)}`);
    }
  }
  if (objTerms.length === 0) {
    lines.push(' obj: 0');
  } else {
    pushWrapped(lines, ' obj: ', objTerms);
  }

  // Constraints
  lines.push('Subject To');
  for (const c of model.constraints) {
    const termStrs: string[] = [];
    for (const [varName, coeff] of Object.entries(c.terms)) {
      if (coeff !== 0) {
        termStrs.push(`${formatCoeff(coeff)} ${sanitizeName(varName)}`);
      }
    }
    if (termStrs.length === 0) continue;
    const op = c.op === '<=' ? '<=' : c.op === '>=' ? '>=' : '=';
    pushWrapped(lines, ` ${sanitizeName(c.label)}: `, termStrs, ` ${op} ${c.rhs}`);
  }

  // Bounds
  lines.push('Bounds');
  for (const v of model.vars) {
    lines.push(` 0 <= ${sanitizeName(v.name)} <= 1`);
  }
  for (const a of model.aux) {
    lines.push(` 0 <= ${sanitizeName(a.name)} <= 1`);
  }

  // General (binary integer variables)
  lines.push('General');
  pushWrapped(lines, ' ', model.vars.map((v) => sanitizeName(v.name)));

  lines.push('End');
  return lines.join('\n');
}

/**
 * Append `terms` to `lines`, wrapping them across multiple lines so no single
 * line exceeds the CPLEX LP format's ~510-character limit. The first line
 * starts with `prefix`; subsequent continuation lines are indented. If
 * `suffix` is given (e.g. ` <= 5` for a constraint RHS), it is appended to the
 * last line. HiGHS-WASM truncates / mis-parses long lines and then reports
 * cryptic errors like "Unable to parse solution. Too few lines."
 */
function pushWrapped(lines: string[], prefix: string, terms: string[], suffix = ''): void {
  if (terms.length === 0) {
    lines.push(prefix.trimEnd() + suffix);
    return;
  }
  const MAX_LINE = 500;
  const CONT_INDENT = '   ';
  let cur = prefix;
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    const candidate = cur === prefix || cur.endsWith(' ') ? cur + t : `${cur} ${t}`;
    if (candidate.length > MAX_LINE && cur !== prefix) {
      lines.push(cur);
      cur = `${CONT_INDENT}${t}`;
    } else {
      cur = candidate;
    }
  }
  lines.push(cur + suffix);
}

function formatCoeff(c: number): string {
  if (c === 1) return '+';
  if (c === -1) return '-';
  // LP format does NOT accept scientific notation; default Number.toString()
  // emits 1e-7 for small magnitudes, which HiGHS-WASM rejects (and can later
  // crash its solution parser with "Unable to parse solution"). Use a fixed
  // decimal format and trim trailing zeros.
  const fixed = formatDecimal(Math.abs(c));
  return c >= 0 ? `+ ${fixed}` : `- ${fixed}`;
}

function formatDecimal(n: number): string {
  if (n === 0) return '0';
  // 12 fractional digits is enough to preserve double precision for values in
  // the typical objective range (|c| up to ~1e6) without scientific notation.
  let s = n.toFixed(12);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

function trySolve(
  HighsModule: { solve: (lp: string, opts: object) => HighsSolution },
  lp: string,
  opts: object,
): HighsSolution | null {
  try {
    return HighsModule.solve(lp, opts);
  } catch (e) {
    console.warn('[optimizer] HiGHS threw:', e instanceof Error ? e.message : e);
    return null;
  }
}

interface HighsSolution {
  Status: string;
  Columns: Record<string, { Primal: number }>;
  ObjectiveValue: number;
}

/** LP variable names may not contain special chars — replace them. */
function sanitizeName(name: string): string {
  // LP format allows letters, digits, and _
  return name.replace(/[^A-Za-z0-9_]/g, '_');
}

function placementsFrom(
  model: MipModel,
  columns: Record<string, { Primal: number }>,
): OptimizerPlacement[] {
  const placements: OptimizerPlacement[] = [];
  for (const v of model.vars) {
    const col = columns[sanitizeName(v.name)];
    if (col && col.Primal > 0.5) {
      const cell = model.cells.find((c) => c.i === v.cellI && c.j === v.cellJ);
      if (cell) {
        placements.push({
          cultivarId: model.plants[v.plantIdx].cultivarId,
          xIn: cell.xCenterIn,
          yIn: cell.yCenterIn,
        });
      }
    }
  }
  return placements;
}

function activeVarNames(
  model: MipModel,
  columns: Record<string, { Primal: number }>,
): string[] {
  return model.vars
    .filter((v) => {
      const col = columns[sanitizeName(v.name)];
      return col && col.Primal > 0.5;
    })
    .map((v) => v.name);
}

function reasonLabel(_input: OptimizationInput, placements: OptimizerPlacement[]): string {
  if (placements.length === 0) return 'no placements found';
  return `${placements.length} plants placed`;
}
