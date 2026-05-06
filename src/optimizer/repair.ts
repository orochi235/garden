import type { OptimizationInput, OptimizerPlacement } from './types';

/**
 * Post-solve repair pass. The MILP often returns one of many objective-tied
 * placements; without a tiebreaker the solver picks arbitrarily and the result
 * looks "irregular" to users. Adding a tiebreak coefficient inside the LP
 * triggers HiGHS-WASM numerical instability (mixed-sign small coefficients
 * lead to internal aborts), so this repair runs *after* the solve to repack
 * placements onto a tight grid.
 *
 * Algorithm: pack plants greedily into rows from top-left, in an order that
 * preserves the solver's *neighborhood structure* (so plants the solver placed
 * near each other end up near each other in the repacked layout). Order is
 * computed by sorting placements along the major axis of the bed using their
 * solver-assigned coordinates. Within each row, plants are placed
 * left-to-right at footprint-pitch intervals. Rows advance by the largest
 * footprint encountered in the previous row.
 */
export function repairPlacements(
  input: OptimizationInput,
  placements: OptimizerPlacement[],
): OptimizerPlacement[] {
  if (placements.length === 0) return placements;

  const footprintByCultivar = new Map<string, number>();
  for (const p of input.plants) {
    if (!footprintByCultivar.has(p.cultivarId)) {
      footprintByCultivar.set(p.cultivarId, p.footprintIn);
    }
  }

  // Pack along the longer axis. For a 4×8ft bed (lengthIn > widthIn) we pack
  // into rows that span the width and stack along the length.
  const packAlongLength = input.bed.lengthIn >= input.bed.widthIn;
  const rowSpan = packAlongLength ? input.bed.widthIn : input.bed.lengthIn;
  const colSpan = packAlongLength ? input.bed.lengthIn : input.bed.widthIn;

  // Sort by solver-assigned position along the packing direction so neighboring
  // plants in the original solution stay neighbors in the repack. Tie-break by
  // the cross-axis so each "row" of solver placements maps to a contiguous run.
  const sorted = [...placements].sort((a, b) => {
    const aMain = packAlongLength ? a.yIn : a.xIn;
    const bMain = packAlongLength ? b.yIn : b.xIn;
    if (aMain !== bMain) return aMain - bMain;
    const aCross = packAlongLength ? a.xIn : a.yIn;
    const bCross = packAlongLength ? b.xIn : b.yIn;
    return aCross - bCross;
  });

  const out: OptimizerPlacement[] = [];
  const clearance = input.bed.edgeClearanceIn;
  let crossCursor = clearance; // top edge of next row (in main-axis units)
  let rowCursor = clearance; // left edge of current row's next slot
  let currentRowMaxFp = 0;

  for (const p of sorted) {
    const fp = footprintByCultivar.get(p.cultivarId) ?? 12;
    // Wrap to a new row if this plant won't fit in the current row.
    if (rowCursor + fp > rowSpan - clearance) {
      crossCursor += currentRowMaxFp;
      rowCursor = clearance;
      currentRowMaxFp = 0;
    }
    // If we've run off the bed in the cross direction, bail out — no room.
    if (crossCursor + fp > colSpan - clearance) break;

    const cellCenterAlongRow = rowCursor + fp / 2;
    const cellCenterAcross = crossCursor + fp / 2;
    const xIn = packAlongLength ? cellCenterAlongRow : cellCenterAcross;
    const yIn = packAlongLength ? cellCenterAcross : cellCenterAlongRow;

    out.push({ cultivarId: p.cultivarId, xIn, yIn });

    rowCursor += fp;
    if (fp > currentRowMaxFp) currentRowMaxFp = fp;
  }

  return out;
}
