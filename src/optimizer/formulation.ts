import type { OptimizationInput } from './types';
import { normalizeShadingTerm } from './weights';

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
        climber: p.climber,
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
      // Σ (cellOrder * x[a,c]) ≤ Σ (cellOrder * x[b,c])
      // Weak ≤ (not strict ≤ −1): coverage already forbids two copies of the same cultivar at
      // the same cell (overlapping footprints), so allowing equality here doesn't admit any
      // illegal solution. The strict form combined with the big-M cellOrder coefficient
      // weakens the LP relaxation and dramatically slows branch-and-bound.
      const terms: Record<string, number> = {};
      for (const v of vars) {
        const order = v.cellI * 1000 + v.cellJ;
        if (v.plantIdx === a) terms[v.name] = (terms[v.name] ?? 0) + order;
        if (v.plantIdx === b) terms[v.name] = (terms[v.name] ?? 0) - order;
      }
      constraints.push({ terms, op: '<=', rhs: 0, label: `sym:${a}<${b}` });
    }
  }

  // Pairwise auxiliary variables for companion/antagonist/shading/same-species buffer
  const aux: MipAuxVar[] = [];
  const adjacencyIn = 24; // pairs within this distance are "adjacent"

  // Build fast lookups to avoid O(n²) searching in inner loops
  const cellByIJ = new Map<string, typeof cells[number]>();
  for (const cell of cells) cellByIJ.set(`${cell.i}_${cell.j}`, cell);

  // Index vars by plantIdx for O(1) per-plant lookup
  const varsByPlant = new Map<number, MipVar[]>();
  for (const v of vars) {
    const arr = varsByPlant.get(v.plantIdx) ?? [];
    arr.push(v);
    varsByPlant.set(v.plantIdx, arr);
  }

  // Precompute adjacency radius in grid cells to limit inner loop iterations
  // adjacencyIn / g = max cell distance to consider
  const maxCellDist = adjacencyIn / g;

  for (let a = 0; a < expanded.length; a++) {
    for (let b = a + 1; b < expanded.length; b++) {
      const plantA = expanded[a];
      const plantB = expanded[b];

      // Determine relationship
      const keyAB = [plantA.cultivarId, plantB.cultivarId].sort().join('|');
      const rel = input.companions.pairs[keyAB];

      // Shading term (only when both have height info AND heights actually differ)
      const hasShading =
        plantA.heightIn != null &&
        plantB.heightIn != null &&
        plantA.heightIn !== plantB.heightIn;
      const sameSpecies = plantA.cultivarId === plantB.cultivarId;

      // Only emit aux vars if there's something to score
      const hasRelationship = rel != null || hasShading || sameSpecies;
      if (!hasRelationship) continue;

      const cellPairsForA = varsByPlant.get(a) ?? [];
      const cellPairsForB = varsByPlant.get(b) ?? [];

      const auxName = `n_${a}_${b}`;

      // Compute objective coefficient for this pair
      let auxCoeff = 0;
      if (rel === 'companion') {
        auxCoeff += weights.companion;
      } else if (rel === 'antagonist') {
        auxCoeff -= weights.antagonist;
      }
      if (sameSpecies) {
        auxCoeff -= weights.sameSpeciesBuffer;
      }
      if (hasShading) {
        const hA = plantA.heightIn!;
        const hB = plantB.heightIn!;
        const shadingPenalty = normalizeShadingTerm(Math.max(hA, hB), Math.min(hA, hB));
        auxCoeff -= weights.shading * shadingPenalty;
      }

      // Skip aux entirely if the coefficient is zero — no contribution to the objective.
      if (!Number.isFinite(auxCoeff) || auxCoeff === 0) continue;

      aux.push({ name: auxName, c: auxCoeff });

      // Aggregate adjacency: for each candidate cell of a, sum b's candidate cells within range.
      // n[a,b] >= x[a, c_a] + sum_{c_b in N(c_a)} x[b, c_b] - 1
      // Since plant b is placed in exactly one cell (placement constraint), the sum is 0 or 1,
      // and this is equivalent to the per-cell-pair big-M form but uses |cells_a| rows instead
      // of |cells_a| * |cells_b within range|.
      // The symmetric anchor on b is redundant (one direction suffices to force n_ab = 1 when
      // both copies are adjacent).
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
        // If no neighbors, this row reduces to n_ab >= x[a,c_a] - 1, which is implied by n_ab >= 0.
        if (neighborCount === 0) continue;
        constraints.push({
          terms,
          op: '<=',
          rhs: 1,
          label: `adj:${auxName}_${va.cellI}_${va.cellJ}`,
        });
      }

      // n[a,b] <= sum x[a,*]  (forces n_ab = 0 if a is unplaced; relevant only for negative coeffs
      // since with placement = 1 these are slack)
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

function pointInRegion(
  cell: { xCenterIn: number; yCenterIn: number },
  r: { xIn: number; yIn: number; widthIn: number; lengthIn: number },
): boolean {
  return (
    cell.xCenterIn >= r.xIn &&
    cell.xCenterIn <= r.xIn + r.widthIn &&
    cell.yCenterIn >= r.yIn &&
    cell.yCenterIn <= r.yIn + r.lengthIn
  );
}
