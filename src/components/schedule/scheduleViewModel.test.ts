import { describe, expect, it } from 'vitest';
import { groupByDate, groupByPlant, formatWindow } from './scheduleViewModel';
import type { ResolvedAction } from '../../model/scheduler';

const ACTIONS: ResolvedAction[] = [
  { plantId: 'p1', cultivarId: 'tomato', actionId: 'sow', label: 'Sow', earliest: '2026-03-19', latest: '2026-04-02', conflicts: [] },
  { plantId: 'p2', cultivarId: 'basil', actionId: 'sow', label: 'Sow', earliest: '2026-03-19', latest: '2026-03-19', conflicts: [] },
  { plantId: 'p1', cultivarId: 'tomato', actionId: 'transplant', label: 'Transplant', earliest: '2026-05-15', latest: '2026-05-15', conflicts: [] },
];

describe('groupByDate', () => {
  it('groups actions by their earliest date', () => {
    const groups = groupByDate(ACTIONS);
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe('2026-03-19');
    expect(groups[0].actions).toHaveLength(2);
    expect(groups[1].date).toBe('2026-05-15');
    expect(groups[1].actions).toHaveLength(1);
  });
});

describe('groupByPlant', () => {
  it('groups actions by plantId', () => {
    const groups = groupByPlant(ACTIONS);
    expect(groups).toHaveLength(2);
    const p1 = groups.find((g) => g.plantId === 'p1')!;
    expect(p1.actions).toHaveLength(2);
    const p2 = groups.find((g) => g.plantId === 'p2')!;
    expect(p2.actions).toHaveLength(1);
  });
});

describe('formatWindow', () => {
  it('returns a single date when earliest === latest', () => {
    expect(formatWindow('2026-05-15', '2026-05-15')).toBe('May 15');
  });
  it('returns a range when they differ', () => {
    expect(formatWindow('2026-03-19', '2026-04-02')).toBe('Mar 19 – Apr 2');
  });
});
