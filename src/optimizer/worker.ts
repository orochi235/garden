import { buildMipModel } from './formulation';
import { greedyHexPack } from './seed';
import { buildNoGoodCut, perturbWeights } from './diversity';
import type { MipModel } from './formulation';
import type { OptimizationInput, OptimizationResult, OptimizationCandidate, OptimizerPlacement } from './types';

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
  const HighsModule = await loadHighs();

  let priorActive: string[] = [];

  for (let n = 0; n < input.candidateCount; n++) {
    if (isCancelled()) break;
    onProgress('build', n);

    const weights = n === 0 ? input.weights : perturbWeights(input.weights, 0.05, 1000 + n);
    const workingInput = { ...input, weights };
    const model = buildMipModel(workingInput);

    if (n > 0 && priorActive.length > 0) {
      model.constraints.push({ ...buildNoGoodCut(priorActive, input.diversityThreshold), label: `nogood:${n}` });
    }

    onProgress('solve', n);
    greedyHexPack(workingInput); // warm-start hint (logged; unused by LP-string API)
    const lpString = mipModelToLpString(model);
    const solveStart = performance.now();

    const solution = HighsModule.solve(lpString, {
      time_limit: input.timeLimitSec,
      mip_rel_gap: input.mipGap,
      output_flag: false,
      log_to_console: false,
    });

    if (solution.Status !== 'Optimal' && solution.Status !== 'Time limit reached') {
      console.warn('[optimizer] candidate', n, 'status:', solution.Status);
      continue;
    }

    const placements = placementsFrom(model, solution.Columns);
    if (placements.length === 0) {
      // HiGHS reports "Time limit reached" with no MIP incumbent; Columns carry no Primal values.
      // Reporting a zero-placement "candidate" misleads the UI.
      console.warn('[optimizer] candidate', n, 'has no placements — status:', solution.Status, 'obj:', solution.ObjectiveValue);
      continue;
    }
    const active = activeVarNames(model, solution.Columns);
    priorActive = active;

    candidates.push({
      placements,
      score: solution.ObjectiveValue,
      reason: reasonLabel(workingInput, placements),
      gap: 0, // highs LP string API doesn't expose MIP gap directly
      solveMs: performance.now() - solveStart,
    });
  }

  return { candidates, totalMs: performance.now() - start };
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
function mipModelToLpString(model: MipModel): string {
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
  if (input.bed.trellisEdge) parts.push(`trellis ${input.bed.trellisEdge}`);
  const companionPairs = Object.values(input.companions.pairs).filter((r) => r === 'companion').length;
  if (companionPairs > 0) parts.push(`${companionPairs} companion pairs`);
  return parts.join(', ');
}
