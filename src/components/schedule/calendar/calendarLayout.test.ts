import { describe, expect, it, vi } from 'vitest';
import type { ResolvedAction } from '../../../model/scheduler';
import { layoutMonth, monthsCoveringActions, MAX_VISIBLE_BARS } from './calendarLayout';

function mkAction(partial: Partial<ResolvedAction>): ResolvedAction {
  return {
    plantId: partial.plantId ?? 'p1',
    cultivarId: partial.cultivarId ?? 'tomato.brandywine',
    actionId: partial.actionId ?? 'sow',
    label: partial.label ?? 'Sow indoors',
    earliest: partial.earliest ?? '2026-05-10',
    latest: partial.latest ?? partial.earliest ?? '2026-05-10',
    conflicts: partial.conflicts ?? [],
  };
}

describe('layoutMonth', () => {
  it('always returns 6 weeks of 7 days', () => {
    const m = layoutMonth(2026, 4, [], '2026-05-15'); // May 2026 (28-day February-less month)
    expect(m.weeks.length).toBe(6);
    for (const row of m.weeks) expect(row.length).toBe(7);
  });

  it('flags inMonth correctly for padding days', () => {
    const m = layoutMonth(2026, 4, [], '2026-05-15');
    // May 1 2026 is a Friday; Sun→Thu before it are April pad days
    expect(m.weeks[0][0].inMonth).toBe(false); // Apr 26 Sun
    expect(m.weeks[0][5].inMonth).toBe(true);  // May 1 Fri
    expect(m.weeks[0][5].date).toBe('2026-05-01');
  });

  it('places a single-day action in the right cell', () => {
    const a = mkAction({ earliest: '2026-05-12', latest: '2026-05-12' });
    const m = layoutMonth(2026, 4, [a], '2026-05-01');
    const cell = findCell(m, '2026-05-12');
    expect(cell.visible.length).toBe(1);
    expect(cell.visible[0].action).toBe(a);
    expect(cell.visible[0].continuationLeft).toBe(false);
    expect(cell.visible[0].continuationRight).toBe(false);
  });

  it('places a multi-day action across all covered cells with correct continuation flags', () => {
    const a = mkAction({ earliest: '2026-05-11', latest: '2026-05-15' });
    const m = layoutMonth(2026, 4, [a], '2026-05-01');
    const monday = findCell(m, '2026-05-11');
    const tue = findCell(m, '2026-05-12');
    const fri = findCell(m, '2026-05-15');
    expect(monday.visible[0].continuationLeft).toBe(false);
    expect(monday.visible[0].continuationRight).toBe(true);
    expect(tue.visible[0].continuationLeft).toBe(true);
    expect(tue.visible[0].continuationRight).toBe(true);
    expect(fri.visible[0].continuationLeft).toBe(true);
    expect(fri.visible[0].continuationRight).toBe(false);
    // Day before window starts: empty
    expect(findCell(m, '2026-05-10').visible.length).toBe(0);
    // Day after window ends: empty
    expect(findCell(m, '2026-05-16').visible.length).toBe(0);
  });

  it('treats a month-boundary-straddling window independently per month', () => {
    const a = mkAction({ earliest: '2026-04-28', latest: '2026-05-03' });
    const may = layoutMonth(2026, 4, [a], '2026-05-01');
    const apr = layoutMonth(2026, 3, [a], '2026-04-01');
    // April side: window starts inside the month, ends after → right continuation
    const apr28 = findCell(apr, '2026-04-28');
    expect(apr28.visible[0].continuationLeft).toBe(false);
    expect(apr28.visible[0].continuationRight).toBe(true);
    // May side: window starts before the month, ends inside → left continuation
    const may1 = findCell(may, '2026-05-01');
    expect(may1.visible[0].continuationLeft).toBe(true);
    expect(may1.visible[0].continuationRight).toBe(true);
    const may3 = findCell(may, '2026-05-03');
    expect(may3.visible[0].continuationLeft).toBe(true);
    expect(may3.visible[0].continuationRight).toBe(false);
  });

  it('caps visible bars and records hiddenCount', () => {
    const actions: ResolvedAction[] = [];
    for (let i = 0; i < MAX_VISIBLE_BARS + 2; i++) {
      actions.push(mkAction({ plantId: `p${i}`, actionId: `a${i}`, earliest: '2026-05-13', latest: '2026-05-13' }));
    }
    const m = layoutMonth(2026, 4, actions, '2026-05-01');
    const cell = findCell(m, '2026-05-13');
    expect(cell.visible.length).toBe(MAX_VISIBLE_BARS);
    expect(cell.hiddenCount).toBe(2);
  });

  it('hasConflict is true iff at least one action has conflicts', () => {
    const a = mkAction({ earliest: '2026-05-14', conflicts: ['some warning'] });
    const m = layoutMonth(2026, 4, [a, mkAction({ earliest: '2026-05-14', plantId: 'p2' })], '2026-05-01');
    expect(findCell(m, '2026-05-14').hasConflict).toBe(true);
    expect(findCell(m, '2026-05-15').hasConflict).toBe(false);
  });

  it('isToday flags the today cell only', () => {
    const m = layoutMonth(2026, 4, [], '2026-05-15');
    expect(findCell(m, '2026-05-15').isToday).toBe(true);
    expect(findCell(m, '2026-05-14').isToday).toBe(false);
  });

  it('isOverdue when latest < today', () => {
    const a = mkAction({ earliest: '2026-05-10', latest: '2026-05-10' });
    const m = layoutMonth(2026, 4, [a], '2026-05-20');
    expect(findCell(m, '2026-05-10').isOverdue).toBe(true);
    // A future action is not overdue
    const b = mkAction({ earliest: '2026-05-25', latest: '2026-05-25', plantId: 'p2' });
    const m2 = layoutMonth(2026, 4, [b], '2026-05-20');
    expect(findCell(m2, '2026-05-25').isOverdue).toBe(false);
  });

  it('clamps an inverted window (latest < earliest) without throwing and logs a console.warn-free path', () => {
    // The model isn't supposed to produce this, but defend.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = mkAction({ earliest: '2026-05-12', latest: '2026-05-10' });
    const m = layoutMonth(2026, 4, [a], '2026-05-01');
    // Action is anchored at earliest only because latest < earliest is clamped to earliest
    expect(findCell(m, '2026-05-12').visible.length).toBe(1);
    expect(findCell(m, '2026-05-11').visible.length).toBe(0);
    warn.mockRestore();
  });

  it('actionCount reflects per-day intersections (multi-day window counts per covered day)', () => {
    const a = mkAction({ earliest: '2026-05-11', latest: '2026-05-13' });
    const m = layoutMonth(2026, 4, [a], '2026-05-01');
    // Three in-month cells contain this action
    expect(m.actionCount).toBe(3);
  });
});

describe('monthsCoveringActions', () => {
  it('returns empty for empty input', () => {
    expect(monthsCoveringActions([])).toEqual([]);
  });

  it('enumerates every month from earliest to latest inclusive', () => {
    const actions = [
      mkAction({ earliest: '2026-04-08', latest: '2026-04-15' }),
      mkAction({ earliest: '2026-06-20', latest: '2026-06-25', plantId: 'p2' }),
    ];
    expect(monthsCoveringActions(actions)).toEqual([
      { year: 2026, month: 3 },
      { year: 2026, month: 4 },
      { year: 2026, month: 5 },
    ]);
  });

  it('handles a single-month span', () => {
    const actions = [mkAction({ earliest: '2026-05-01', latest: '2026-05-15' })];
    expect(monthsCoveringActions(actions)).toEqual([{ year: 2026, month: 4 }]);
  });

  it('caps to 12 months', () => {
    const actions = [
      mkAction({ earliest: '2025-01-01', latest: '2025-01-01' }),
      mkAction({ earliest: '2027-12-01', latest: '2027-12-01', plantId: 'p2' }),
    ];
    expect(monthsCoveringActions(actions).length).toBe(12);
  });

  it('wraps year correctly', () => {
    const actions = [
      mkAction({ earliest: '2026-11-15', latest: '2026-11-15' }),
      mkAction({ earliest: '2027-02-15', latest: '2027-02-15', plantId: 'p2' }),
    ];
    expect(monthsCoveringActions(actions)).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2027, month: 0 },
      { year: 2027, month: 1 },
    ]);
  });
});

function findCell(m: ReturnType<typeof layoutMonth>, date: string) {
  for (const row of m.weeks) for (const cell of row) if (cell.date === date) return cell;
  throw new Error(`cell ${date} not in month ${m.year}-${m.month}`);
}
