import { describe, expect, it } from 'vitest';
import { createTray } from './nursery';
import { resolveGroupMoves, type PendingMove } from './seedlingMoveResolver';

function withSlot(tray: ReturnType<typeof createTray>, row: number, col: number, seedlingId: string) {
  const slots = tray.slots.slice();
  slots[row * tray.cols + col] = { state: 'sown', seedlingId };
  return { ...tray, slots };
}

describe('resolveGroupMoves', () => {
  it('places all moves on their ideal targets when no collisions', () => {
    let tray = createTray({ rows: 3, cols: 4, cellSize: 'medium', label: 't' });
    tray = withSlot(tray, 0, 0, 'a');
    tray = withSlot(tray, 0, 1, 'b');
    const pending: PendingMove[] = [
      { seedlingId: 'a', cultivarId: 'x', fromRow: 0, fromCol: 0, toRow: 1, toCol: 1 },
      { seedlingId: 'b', cultivarId: 'x', fromRow: 0, fromCol: 1, toRow: 1, toCol: 2 },
    ];
    const r = resolveGroupMoves(tray, pending);
    expect(r.feasible).toBe(true);
    expect(r.moves.map((m) => [m.finalRow, m.finalCol, m.bumped])).toEqual([
      [1, 1, false],
      [1, 2, false],
    ]);
  });

  it('treats cells vacated by other movers as available', () => {
    let tray = createTray({ rows: 1, cols: 3, cellSize: 'medium', label: 't' });
    tray = withSlot(tray, 0, 0, 'a');
    tray = withSlot(tray, 0, 1, 'b');
    const pending: PendingMove[] = [
      { seedlingId: 'a', cultivarId: 'x', fromRow: 0, fromCol: 0, toRow: 0, toCol: 1 },
      { seedlingId: 'b', cultivarId: 'x', fromRow: 0, fromCol: 1, toRow: 0, toCol: 0 },
    ];
    const r = resolveGroupMoves(tray, pending);
    expect(r.feasible).toBe(true);
    expect(r.moves.find((m) => m.seedlingId === 'a')!.finalCol).toBe(1);
    expect(r.moves.find((m) => m.seedlingId === 'b')!.finalCol).toBe(0);
  });

  it('bumps a blocked move to the closest available cell', () => {
    let tray = createTray({ rows: 3, cols: 3, cellSize: 'medium', label: 't' });
    tray = withSlot(tray, 1, 1, 'static');
    tray = withSlot(tray, 0, 0, 'a');
    const pending: PendingMove[] = [
      { seedlingId: 'a', cultivarId: 'x', fromRow: 0, fromCol: 0, toRow: 1, toCol: 1 },
    ];
    const r = resolveGroupMoves(tray, pending);
    expect(r.feasible).toBe(true);
    expect(r.moves[0].bumped).toBe(true);
    // Closest available cell to (1,1) at Chebyshev distance 1.
    const { finalRow, finalCol } = r.moves[0];
    expect(Math.max(Math.abs(finalRow - 1), Math.abs(finalCol - 1))).toBe(1);
  });

  it('marks infeasible when a target is out of bounds', () => {
    let tray = createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 't' });
    tray = withSlot(tray, 0, 0, 'a');
    const pending: PendingMove[] = [
      { seedlingId: 'a', cultivarId: 'x', fromRow: 0, fromCol: 0, toRow: 0, toCol: 5 },
    ];
    const r = resolveGroupMoves(tray, pending);
    expect(r.feasible).toBe(false);
  });

  it('marks infeasible when no available cells exist for a bumped move', () => {
    // 1x2 tray, both cells occupied by static seedlings; mover targets one of them.
    let tray = createTray({ rows: 1, cols: 2, cellSize: 'medium', label: 't' });
    tray = withSlot(tray, 0, 0, 'static-1');
    tray = withSlot(tray, 0, 1, 'static-2');
    // Mover not in tray yet; target (0,0) which is blocked. No available cell anywhere.
    const pending: PendingMove[] = [
      { seedlingId: 'mover', cultivarId: 'x', fromRow: 0, fromCol: 0, toRow: 0, toCol: 0 },
    ];
    // We have to fake the mover being on the tray for the test; resolver only
    // cares about pending.seedlingId vs tray.slots[*].seedlingId for "movingIds".
    const r = resolveGroupMoves(tray, pending);
    expect(r.feasible).toBe(false);
  });

  it('does not assign two moves to the same final cell', () => {
    let tray = createTray({ rows: 1, cols: 3, cellSize: 'medium', label: 't' });
    tray = withSlot(tray, 0, 0, 'a');
    tray = withSlot(tray, 0, 2, 'b');
    tray = withSlot(tray, 0, 1, 'static');
    const pending: PendingMove[] = [
      { seedlingId: 'a', cultivarId: 'x', fromRow: 0, fromCol: 0, toRow: 0, toCol: 1 },
      { seedlingId: 'b', cultivarId: 'x', fromRow: 0, fromCol: 2, toRow: 0, toCol: 1 },
    ];
    const r = resolveGroupMoves(tray, pending);
    const cells = r.moves.map((m) => `${m.finalRow},${m.finalCol}`);
    expect(new Set(cells).size).toBe(2);
  });
});
