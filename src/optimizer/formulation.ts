import type { OptimizationInput } from './types';
import { normalizeShadingTerm, normalizeCompanionTerm } from './weights';

export interface MipVar {
  /** Encoded as `x_<plantIdx>_<cellI>_<cellJ>`. */
  name: string;
  plantIdx: number;
  cellI: number;
  cellJ: number;
  /** Constant coefficient in the objective (covers per-cell terms #7, #8). */
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
  plants: { cultivarId: string; footprintIn: number; heightIn: number | null; climber: boolean }[];
}

export function buildMipModel(input: OptimizationInput): MipModel {
  const { bed, plants, gridResolutionIn: g, weights } = input;
  const cells: MipModel['cells'] = [];
  const cols = Math.floor((bed.widthIn - 2 * bed.edgeClearanceIn) / g);
  const rows = Math.floor((bed.heightIn - 2 * bed.edgeClearanceIn) / g);

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
        climber: p.climber,
      });
    }
  }

  const vars: MipVar[] = [];
  for (let pi = 0; pi < expanded.length; pi++) {
    for (const cell of cells) {
      if (footprintFits(expanded[pi], cell, bed, g)) {
        const c = perCellCoeff(expanded[pi], cell, input);
        vars.push({
          name: `x_${pi}_${cell.i}_${cell.j}`,
          plantIdx: pi,
          cellI: cell.i,
          cellJ: cell.j,
          c,
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
    // Always emit the coverage constraint for each cell (even if empty terms — 0 <= 1 is valid)
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
      // Σ (cellOrder * x[a,c]) ≤ Σ (cellOrder * x[b,c]) - 1
      const terms: Record<string, number> = {};
      for (const v of vars) {
        const order = v.cellI * 1000 + v.cellJ;
        if (v.plantIdx === a) terms[v.name] = (terms[v.name] ?? 0) + order;
        if (v.plantIdx === b) terms[v.name] = (terms[v.name] ?? 0) - order;
      }
      constraints.push({ terms, op: '<=', rhs: -1, label: `sym:${a}<${b}` });
    }
  }

  // Pairwise auxiliary variables for companion/antagonist/shading/same-species buffer
  const aux: MipAuxVar[] = [];
  const adjacencyIn = 24; // pairs within this distance are "adjacent"

  for (let a = 0; a < expanded.length; a++) {
    for (let b = a + 1; b < expanded.length; b++) {
      const plantA = expanded[a];
      const plantB = expanded[b];

      // Determine relationship
      const keyAB = [plantA.cultivarId, plantB.cultivarId].sort().join('|');
      const rel = input.companions.pairs[keyAB];

      // Shading term (only when both have height info)
      const hasShading = plantA.heightIn != null && plantB.heightIn != null;
      const sameSpecies = plantA.cultivarId === plantB.cultivarId;

      // Only emit aux vars if there's something to score
      const hasRelationship = rel != null || hasShading || sameSpecies;
      if (!hasRelationship) continue;

      // Find cell pairs within adjacency radius
      const cellPairsForA = vars.filter((v) => v.plantIdx === a);
      const cellPairsForB = vars.filter((v) => v.plantIdx === b);

      // For each close cell pair, emit: n[a,b,i,j,k,l] >= x[a,i,j] + x[b,k,l] - 1
      // We aggregate into a single aux var n_a_b that is 1 if they are adjacent
      const auxName = `n_${a}_${b}`;

      // Compute objective coefficient for this pair
      let auxCoeff = 0;
      if (rel === 'companion') {
        auxCoeff += weights.companion; // nearby companions: reward
      } else if (rel === 'antagonist') {
        auxCoeff -= weights.antagonist; // nearby antagonists: penalize
      }
      if (sameSpecies) {
        auxCoeff -= weights.sameSpeciesBuffer; // penalize same-species adjacent
      }
      if (hasShading) {
        const hA = plantA.heightIn!;
        const hB = plantB.heightIn!;
        const shadingPenalty = normalizeShadingTerm(Math.max(hA, hB), Math.min(hA, hB));
        auxCoeff -= weights.shading * shadingPenalty;
      }

      aux.push({ name: auxName, c: auxCoeff });

      // n[a,b] >= x[a,i,j] + x[b,k,l] - 1 for close cell pairs
      for (const va of cellPairsForA) {
        for (const vb of cellPairsForB) {
          const cellA = cells.find((c) => c.i === va.cellI && c.j === va.cellJ)!;
          const cellB = cells.find((c) => c.i === vb.cellI && c.j === vb.cellJ)!;
          const dist = Math.hypot(cellA.xCenterIn - cellB.xCenterIn, cellA.yCenterIn - cellB.yCenterIn);
          if (dist <= adjacencyIn) {
            // n[a,b] >= x[a,i,j] + x[b,k,l] - 1
            // => -n[a,b] + x[a,i,j] + x[b,k,l] <= 1
            constraints.push({
              terms: { [auxName]: -1, [va.name]: 1, [vb.name]: 1 },
              op: '<=',
              rhs: 1,
              label: `adj:${auxName}_${va.cellI}_${va.cellJ}_${vb.cellI}_${vb.cellJ}`,
            });
          }
        }
      }

      // n[a,b] <= sum x[a,*]  (=> n can only be 1 if plant a is placed)
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
  _g: number,
): boolean {
  const r = p.footprintIn / 2;
  return (
    cell.xCenterIn - r >= bed.edgeClearanceIn &&
    cell.xCenterIn + r <= bed.widthIn - bed.edgeClearanceIn &&
    cell.yCenterIn - r >= bed.edgeClearanceIn &&
    cell.yCenterIn + r <= bed.heightIn - bed.edgeClearanceIn
  );
}

function footprintCoversCell(
  p: MipModel['plants'][number],
  placedI: number,
  placedJ: number,
  target: { i: number; j: number; xCenterIn: number; yCenterIn: number },
  g: number,
): boolean {
  // The plant is centered on cell (placedI, placedJ). It covers `target` if the
  // distance between cell centers is less than (footprint radius).
  const dx = (placedI - target.i) * g;
  const dy = (placedJ - target.j) * g;
  return dx * dx + dy * dy < (p.footprintIn / 2) * (p.footprintIn / 2);
}

function perCellCoeff(
  p: MipModel['plants'][number],
  cell: { xCenterIn: number; yCenterIn: number },
  input: OptimizationInput,
): number {
  let c = 0;
  // Trellis attraction: closer to the trellis edge → higher coefficient
  if (p.climber && input.bed.trellisEdge) {
    const distFromEdge = distanceToEdge(cell, input.bed);
    const maxDist = Math.max(input.bed.widthIn, input.bed.heightIn);
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

function distanceToEdge(
  cell: { xCenterIn: number; yCenterIn: number },
  bed: OptimizationInput['bed'],
): number {
  switch (bed.trellisEdge) {
    case 'N': return cell.yCenterIn;
    case 'S': return bed.heightIn - cell.yCenterIn;
    case 'W': return cell.xCenterIn;
    case 'E': return bed.widthIn - cell.xCenterIn;
    case null: default: return 0;
  }
}

function pointInRegion(
  cell: { xCenterIn: number; yCenterIn: number },
  r: { xIn: number; yIn: number; widthIn: number; heightIn: number },
): boolean {
  return (
    cell.xCenterIn >= r.xIn &&
    cell.xCenterIn <= r.xIn + r.widthIn &&
    cell.yCenterIn >= r.yIn &&
    cell.yCenterIn <= r.yIn + r.heightIn
  );
}
