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

    for (const p of subPlacements) {
      allPlacements.push({
        cultivarId: p.cultivarId,
        xIn: p.xIn + subBed.offsetIn.x,
        yIn: p.yIn + subBed.offsetIn.y,
      });
    }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadHighs(): Promise<any> {
  const [mod, wasmUrlMod] = await Promise.all([
    import('highs'),
    import('highs/runtime?url'),
  ]);
  const loader = (mod as any).default ?? mod;
  const wasmUrl = (wasmUrlMod as any).default ?? wasmUrlMod;
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
    lines.push(` obj: ${objTerms.join(' ')}`);
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
    const lhs = termStrs.join(' ');
    const op = c.op === '<=' ? '<=' : c.op === '>=' ? '>=' : '=';
    lines.push(` ${sanitizeName(c.label)}: ${lhs} ${op} ${c.rhs}`);
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
  const binaryNames = model.vars.map((v) => sanitizeName(v.name)).join(' ');
  if (binaryNames) lines.push(` ${binaryNames}`);

  lines.push('End');
  return lines.join('\n');
}

function formatCoeff(c: number): string {
  if (c === 1) return '+';
  if (c === -1) return '-';
  if (c >= 0) return `+ ${c}`;
  return `- ${Math.abs(c)}`;
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

/** Identify aux variable names whose pair represents same-species copies. */
function sameSpeciesAuxNames(model: MipModel): Set<string> {
  const out = new Set<string>();
  for (const aux of model.aux) {
    const m = aux.name.match(/^n_(\d+)_(\d+)$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (model.plants[a]?.cultivarId === model.plants[b]?.cultivarId) {
      out.add(aux.name);
    }
  }
  return out;
}

/** Match `adj:n_{a}_{b}_{i}_{j}`, `adj_ub_a:n_{a}_{b}`, or `adj_ub_b:n_{a}_{b}` rows. */
function isAdjRowForAux(label: string, auxNames: Set<string>): boolean {
  const m = label.match(/^(?:adj|adj_ub_a|adj_ub_b):(n_\d+_\d+)/);
  return m != null && auxNames.has(m[1]);
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
