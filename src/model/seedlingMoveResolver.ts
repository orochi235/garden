import type { Tray } from './nursery';

export interface PendingMove {
  seedlingId: string;
  cultivarId: string;
  fromRow: number;
  fromCol: number;
  /** Ideal target row (cursor + relative offset). May be out of bounds. */
  toRow: number;
  toCol: number;
}

export interface ResolvedMove extends PendingMove {
  /** Final cell after bumping for collisions. */
  finalRow: number;
  finalCol: number;
  /** True iff the resolver had to bump this move off its ideal target. */
  bumped: boolean;
}

export interface ResolveResult {
  feasible: boolean;
  moves: ResolvedMove[];
}

function inBounds(tray: Tray, row: number, col: number): boolean {
  return row >= 0 && row < tray.rows && col >= 0 && col < tray.cols;
}

/**
 * Resolve target cells for a group of seedlings being moved. All ideal targets
 * must be within tray bounds; otherwise the entire move is infeasible. Collisions
 * with non-moving seedlings are resolved by bumping each blocked move to the
 * closest available cell (Chebyshev distance, then row-major tiebreak).
 *
 * Cells vacated by other moves count as available; cells claimed by an earlier
 * resolved move do not.
 */
export function resolveGroupMoves(tray: Tray, pending: PendingMove[]): ResolveResult {
  // Bail early if any ideal target is out of bounds.
  for (const m of pending) {
    if (!inBounds(tray, m.toRow, m.toCol)) {
      return {
        feasible: false,
        moves: pending.map((p) => ({
          ...p,
          finalRow: p.toRow,
          finalCol: p.toCol,
          bumped: false,
        })),
      };
    }
  }

  const movingIds = new Set(pending.map((m) => m.seedlingId));
  // Cells that count as obstacles: occupied by a non-mover.
  function isBlocked(row: number, col: number): boolean {
    const slot = tray.slots[row * tray.cols + col];
    if (!slot || slot.state === 'empty') return false;
    if (!slot.seedlingId) return false;
    return !movingIds.has(slot.seedlingId);
  }

  // Place anchor moves first (those whose ideal target is unblocked) so the
  // dragged group keeps its intended shape; bumped moves resolve afterward.
  const indices = pending.map((_, i) => i);
  indices.sort((a, b) => {
    const ablocked = isBlocked(pending[a].toRow, pending[a].toCol) ? 1 : 0;
    const bblocked = isBlocked(pending[b].toRow, pending[b].toCol) ? 1 : 0;
    return ablocked - bblocked;
  });

  const claimed = new Set<string>(); // "row,col"
  const key = (r: number, c: number) => `${r},${c}`;
  const resolved: ResolvedMove[] = new Array(pending.length);
  let feasible = true;

  for (const i of indices) {
    const m = pending[i];
    const ideal = { r: m.toRow, c: m.toCol };
    const idealKey = key(ideal.r, ideal.c);
    if (!isBlocked(ideal.r, ideal.c) && !claimed.has(idealKey)) {
      claimed.add(idealKey);
      resolved[i] = { ...m, finalRow: ideal.r, finalCol: ideal.c, bumped: false };
      continue;
    }
    // BFS by Chebyshev distance for the nearest available cell.
    const found = findNearestAvailable(tray, ideal.r, ideal.c, isBlocked, claimed, key);
    if (!found) {
      feasible = false;
      resolved[i] = { ...m, finalRow: ideal.r, finalCol: ideal.c, bumped: true };
      continue;
    }
    claimed.add(key(found.row, found.col));
    resolved[i] = { ...m, finalRow: found.row, finalCol: found.col, bumped: true };
  }

  return { feasible, moves: resolved };
}

function findNearestAvailable(
  tray: Tray,
  r0: number,
  c0: number,
  isBlocked: (r: number, c: number) => boolean,
  claimed: Set<string>,
  key: (r: number, c: number) => string,
): { row: number; col: number } | null {
  const maxRing = Math.max(tray.rows, tray.cols);
  for (let d = 1; d <= maxRing; d++) {
    // Walk the Chebyshev ring at distance d, in a deterministic order so
    // ties resolve consistently.
    const candidates: Array<{ row: number; col: number }> = [];
    for (let dr = -d; dr <= d; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
        candidates.push({ row: r0 + dr, col: c0 + dc });
      }
    }
    // Prefer smaller Manhattan distance first, then row-major.
    candidates.sort((a, b) => {
      const da = Math.abs(a.row - r0) + Math.abs(a.col - c0);
      const db = Math.abs(b.row - r0) + Math.abs(b.col - c0);
      if (da !== db) return da - db;
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });
    for (const cand of candidates) {
      if (!inBounds(tray, cand.row, cand.col)) continue;
      if (isBlocked(cand.row, cand.col)) continue;
      if (claimed.has(key(cand.row, cand.col))) continue;
      return cand;
    }
  }
  return null;
}
