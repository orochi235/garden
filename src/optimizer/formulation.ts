import type { OptimizationInput, OptimizerWeights } from './types';
import { ADJACENCY_IN, pairCoeff } from './scoring/pairwiseScore';

/**
 * Validate that every numeric field on `OptimizerWeights` is a finite number.
 * Catches test harnesses that pass weights with the wrong field names — an
 * undefined field would otherwise flow into `auxCoeff -= undefined` → NaN
 * and serialize as `obj: − NaN n_0_1`.
 */
function validateWeights(weights: OptimizerWeights): void {
  if (weights == null || typeof weights !== 'object') {
    throw new Error(`buildMipModel: weights must be an object, got ${String(weights)}`);
  }
  const requiredFields: (keyof OptimizerWeights)[] = ['shading', 'sameSpeciesBuffer'];
  for (const field of requiredFields) {
    const v = weights[field];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(
        `buildMipModel: weights.${field} must be a finite number, got ${String(v)}`,
      );
    }
  }
}

export interface MipVar {
  /** Encoded as `x_<plantIdx>_<cellI>_<cellJ>`. */
  name: string;
  plantIdx: number;
  cellI: number;
  cellJ: number;
  /** Constant coefficient in the objective. Always 0 in the simplified model
   *  (no per-cell terms remain) — kept for forward compatibility. */
  c: number;
}

export interface MipAuxVar {
  name: string;
  /** Coefficient in the objective. */
  c: number;
}

export interface MipConstraint {
  /** Variable name → coefficient. */
  terms: Record<string, number>;
  op: '<=' | '=' | '>=';
  rhs: number;
  label: string;
}

export interface MipModel {
  vars: MipVar[];
  aux: MipAuxVar[];
  constraints: MipConstraint[];
  /** Sense: maximize objective. */
  sense: 'max';
  /** Cell metadata so the worker can map variable assignments back to placements. */
  cells: { i: number; j: number; xCenterIn: number; yCenterIn: number }[];
  plants: { cultivarId: string; footprintIn: number; heightIn: number | null }[];
}

export function buildMipModel(input: OptimizationInput): MipModel {
  const { bed, plants, gridResolutionIn: g, weights } = input;
  validateWeights(weights);
  const cells: MipModel['cells'] = [];
  const cols = Math.floor((bed.widthIn - 2 * bed.edgeClearanceIn) / g);
  const rows = Math.floor((bed.lengthIn - 2 * bed.edgeClearanceIn) / g);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const xCenter = bed.edgeClearanceIn + (i + 0.5) * g;
      const yCenter = bed.edgeClearanceIn + (j + 0.5) * g;
      cells.push({ i, j, xCenterIn: xCenter, yCenterIn: yCenter });
    }
  }

  const expanded: MipModel['plants'] = [];
  for (const p of plants) {
    for (let k = 0; k < p.count; k++) {
      expanded.push({
        cultivarId: p.cultivarId,
        footprintIn: p.footprintIn,
        heightIn: p.heightIn,
      });
    }
  }

  // Per-plant candidate-cell pitch: snap candidate cells to a stride proportional
  // to the plant's footprint. A 12-inch tomato has no business getting 4-inch
  // placement candidates — cuts the binary-var count dramatically without
  // hurting solution quality (placements only a few inches apart are
  // indistinguishable to the user). Pitch is in fine-grid cells.
  const plantPitch: number[] = expanded.map((p) =>
    Math.max(1, Math.round(p.footprintIn / g / 2)),
  );

  const vars: MipVar[] = [];
  for (let pi = 0; pi < expanded.length; pi++) {
    const stride = plantPitch[pi];
    for (const cell of cells) {
      if (cell.i % stride !== 0 || cell.j % stride !== 0) continue;
      if (footprintFits(expanded[pi], cell, bed)) {
        vars.push({
          name: `x_${pi}_${cell.i}_${cell.j}`,
          plantIdx: pi,
          cellI: cell.i,
          cellJ: cell.j,
          c: 0,
        });
      }
    }
  }

  const constraints: MipConstraint[] = [];

  // Placement: each plant copy placed exactly once
  for (let pi = 0; pi < expanded.length; pi++) {
    const terms: Record<string, number> = {};
    for (const v of vars) if (v.plantIdx === pi) terms[v.name] = 1;
    constraints.push({ terms, op: '=', rhs: 1, label: `placement:${pi}` });
  }

  // Cell coverage: each bed cell covered by ≤ 1 footprint
  for (const cell of cells) {
    const terms: Record<string, number> = {};
    for (const v of vars) {
      if (footprintCoversCell(expanded[v.plantIdx], v.cellI, v.cellJ, cell, g)) {
        terms[v.name] = 1;
      }
    }
    constraints.push({ terms, op: '<=', rhs: 1, label: `coverage:${cell.i}_${cell.j}` });
  }

  // Symmetry breaking: lex-order copies of the same cultivar
  const groups = new Map<string, number[]>();
  for (let pi = 0; pi < expanded.length; pi++) {
    const k = expanded[pi].cultivarId;
    const arr = groups.get(k) ?? [];
    arr.push(pi);
    groups.set(k, arr);
  }
  for (const [, indices] of groups) {
    if (indices.length < 2) continue;
    for (let n = 0; n < indices.length - 1; n++) {
      const a = indices[n];
      const b = indices[n + 1];
      const terms: Record<string, number> = {};
      for (const v of vars) {
        const order = v.cellI * 1000 + v.cellJ;
        if (v.plantIdx === a) terms[v.name] = (terms[v.name] ?? 0) + order;
        if (v.plantIdx === b) terms[v.name] = (terms[v.name] ?? 0) - order;
      }
      constraints.push({ terms, op: '<=', rhs: 0, label: `sym:${a}<${b}` });
    }
  }

  // Pairwise auxiliary variables for shading + same-species buffer (both negative
  // coefficients — the one-sided coupling we use is correct for negatives only).
  const aux: MipAuxVar[] = [];
  const adjacencyIn = ADJACENCY_IN;

  const cellByIJ = new Map<string, typeof cells[number]>();
  for (const cell of cells) cellByIJ.set(`${cell.i}_${cell.j}`, cell);

  const varsByPlant = new Map<number, MipVar[]>();
  for (const v of vars) {
    const arr = varsByPlant.get(v.plantIdx) ?? [];
    arr.push(v);
    varsByPlant.set(v.plantIdx, arr);
  }

  const maxCellDist = adjacencyIn / g;

  for (let a = 0; a < expanded.length; a++) {
    for (let b = a + 1; b < expanded.length; b++) {
      const plantA = expanded[a];
      const plantB = expanded[b];

      const auxCoeff = pairCoeff(plantA, plantB, weights);

      if (auxCoeff === 0) continue;
      if (!Number.isFinite(auxCoeff)) {
        // Weights are validated at entry; reaching here means a non-finite value
        // crept in via shading normalization or a future code path.
        throw new Error(
          `buildMipModel: non-finite aux coefficient ${auxCoeff} for pair (${a},${b})`,
        );
      }

      const auxName = `n_${a}_${b}`;
      aux.push({ name: auxName, c: auxCoeff });

      const cellPairsForA = varsByPlant.get(a) ?? [];
      const cellPairsForB = varsByPlant.get(b) ?? [];

      // n[a,b] >= x[a, c_a] + sum_{c_b in N(c_a)} x[b, c_b] - 1
      for (const va of cellPairsForA) {
        const cellA = cellByIJ.get(`${va.cellI}_${va.cellJ}`)!;
        const terms: Record<string, number> = { [auxName]: -1, [va.name]: 1 };
        let neighborCount = 0;
        for (const vb of cellPairsForB) {
          const di = Math.abs(va.cellI - vb.cellI);
          const dj = Math.abs(va.cellJ - vb.cellJ);
          if (di > maxCellDist || dj > maxCellDist) continue;
          const cellB = cellByIJ.get(`${vb.cellI}_${vb.cellJ}`)!;
          const dist = Math.hypot(cellA.xCenterIn - cellB.xCenterIn, cellA.yCenterIn - cellB.yCenterIn);
          if (dist <= adjacencyIn) {
            terms[vb.name] = (terms[vb.name] ?? 0) + 1;
            neighborCount++;
          }
        }
        if (neighborCount === 0) continue;
        constraints.push({
          terms,
          op: '<=',
          rhs: 1,
          label: `adj:${auxName}_${va.cellI}_${va.cellJ}`,
        });
      }

      // n[a,b] <= sum x[a,*]
      const termsA: Record<string, number> = { [auxName]: 1 };
      for (const va of cellPairsForA) termsA[va.name] = -1;
      constraints.push({ terms: termsA, op: '<=', rhs: 0, label: `adj_ub_a:${auxName}` });

      // n[a,b] <= sum x[b,*]
      const termsB: Record<string, number> = { [auxName]: 1 };
      for (const vb of cellPairsForB) termsB[vb.name] = -1;
      constraints.push({ terms: termsB, op: '<=', rhs: 0, label: `adj_ub_b:${auxName}` });
    }
  }

  return { vars, aux, constraints, sense: 'max', cells, plants: expanded };
}

function footprintFits(
  p: MipModel['plants'][number],
  cell: { i: number; j: number; xCenterIn: number; yCenterIn: number },
  bed: OptimizationInput['bed'],
): boolean {
  const r = p.footprintIn / 2;
  return (
    cell.xCenterIn - r >= bed.edgeClearanceIn &&
    cell.xCenterIn + r <= bed.widthIn - bed.edgeClearanceIn &&
    cell.yCenterIn - r >= bed.edgeClearanceIn &&
    cell.yCenterIn + r <= bed.lengthIn - bed.edgeClearanceIn
  );
}

function footprintCoversCell(
  p: MipModel['plants'][number],
  placedI: number,
  placedJ: number,
  target: { i: number; j: number; xCenterIn: number; yCenterIn: number },
  g: number,
): boolean {
  const dx = (placedI - target.i) * g;
  const dy = (placedJ - target.j) * g;
  return dx * dx + dy * dy < (p.footprintIn / 2) * (p.footprintIn / 2);
}

/**
 * Estimate the placement-var count without building the full model.
 */
export function estimatePlacementVars(input: OptimizationInput): number {
  const { bed, plants, gridResolutionIn: g } = input;
  const cols = Math.floor((bed.widthIn - 2 * bed.edgeClearanceIn) / g);
  const rows = Math.floor((bed.lengthIn - 2 * bed.edgeClearanceIn) / g);

  const expanded: Array<{ footprintIn: number }> = [];
  for (const p of plants) {
    for (let k = 0; k < p.count; k++) {
      expanded.push({ footprintIn: p.footprintIn });
    }
  }

  const plantPitch: number[] = expanded.map((p) =>
    Math.max(1, Math.round(p.footprintIn / g / 2)),
  );

  let total = 0;
  for (let pi = 0; pi < expanded.length; pi++) {
    const stride = plantPitch[pi];
    let candidateCells = 0;
    for (let i = 0; i < cols; i++) {
      if (i % stride !== 0) continue;
      for (let j = 0; j < rows; j++) {
        if (j % stride !== 0) continue;
        const xCenter = bed.edgeClearanceIn + (i + 0.5) * g;
        const yCenter = bed.edgeClearanceIn + (j + 0.5) * g;
        const r = expanded[pi].footprintIn / 2;
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
    total += candidateCells;
  }
  return total;
}
