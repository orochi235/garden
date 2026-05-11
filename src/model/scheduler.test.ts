import { describe, it, expect } from 'vitest';
import type { Constraint, ActionDef, ScheduleInputs } from './scheduler';
import { addOffset } from './scheduler';

describe('scheduler types', () => {
  it('exports the expected types', () => {
    const c: Constraint = { kind: 'exact', anchor: { kind: 'target-transplant' } };
    const a: ActionDef = { id: 'transplant', label: 'Transplant', constraints: [c] };
    const inputs: ScheduleInputs = {
      plants: [{ id: 'p1', cultivarId: 'tomato', actions: [a] }],
      targetTransplantDate: '2026-05-15',
    };
    expect(inputs.plants).toHaveLength(1);
  });
});

describe('addOffset', () => {
  it('adds positive days', () => {
    expect(addOffset('2026-03-01', { amount: 7, unit: 'days' })).toBe('2026-03-08');
  });

  it('subtracts negative days', () => {
    expect(addOffset('2026-03-08', { amount: -7, unit: 'days' })).toBe('2026-03-01');
  });

  it('adds weeks (= 7 days)', () => {
    expect(addOffset('2026-03-01', { amount: 2, unit: 'weeks' })).toBe('2026-03-15');
  });

  it('adds months by calendar (DST-safe)', () => {
    expect(addOffset('2026-01-15', { amount: 1, unit: 'months' })).toBe('2026-02-15');
    expect(addOffset('2026-03-31', { amount: 1, unit: 'months' })).toBe('2026-04-30'); // clamp
    expect(addOffset('2026-12-15', { amount: 1, unit: 'months' })).toBe('2027-01-15');
  });

  it('negative months subtract calendar months', () => {
    expect(addOffset('2026-03-15', { amount: -1, unit: 'months' })).toBe('2026-02-15');
    expect(addOffset('2026-03-31', { amount: -1, unit: 'months' })).toBe('2026-02-28'); // clamp
  });
});

import { resolveAnchor } from './scheduler';

describe('resolveAnchor', () => {
  const ctx = {
    targetTransplantDate: '2026-05-15',
    lastFrostDate: '2026-04-30',
    firstFrostDate: '2026-10-15',
    today: '2026-03-01',
    actionDates: new Map<string, string>([['sow', '2026-03-08']]),
  };

  it('resolves target-transplant', () => {
    expect(resolveAnchor({ kind: 'target-transplant' }, ctx)).toBe('2026-05-15');
  });
  it('resolves last-frost', () => {
    expect(resolveAnchor({ kind: 'last-frost' }, ctx)).toBe('2026-04-30');
  });
  it('resolves first-frost', () => {
    expect(resolveAnchor({ kind: 'first-frost' }, ctx)).toBe('2026-10-15');
  });
  it('resolves absolute', () => {
    expect(resolveAnchor({ kind: 'absolute', date: '2026-07-04' }, ctx)).toBe('2026-07-04');
  });
  it('resolves today', () => {
    expect(resolveAnchor({ kind: 'today' }, ctx)).toBe('2026-03-01');
  });
  it('resolves action ref', () => {
    expect(resolveAnchor({ kind: 'action', actionId: 'sow' }, ctx)).toBe('2026-03-08');
  });
  it('returns null for missing data', () => {
    const empty = { targetTransplantDate: '2026-05-15', actionDates: new Map<string, string>() };
    expect(resolveAnchor({ kind: 'last-frost' }, empty)).toBeNull();
    expect(resolveAnchor({ kind: 'action', actionId: 'sow' }, empty)).toBeNull();
  });
});

import { resolveConstraint } from './scheduler';

describe('resolveConstraint', () => {
  const ctx = {
    targetTransplantDate: '2026-05-15',
    lastFrostDate: '2026-04-30',
    actionDates: new Map<string, string>(),
  };

  it('exact constraint with no offset returns the anchor date', () => {
    expect(resolveConstraint({ kind: 'exact', anchor: { kind: 'target-transplant' } }, ctx))
      .toBe('2026-05-15');
  });

  it('lower with negative offset (4 weeks before last-frost)', () => {
    expect(resolveConstraint({
      kind: 'lower',
      anchor: { kind: 'last-frost' },
      offset: { amount: -4, unit: 'weeks' },
    }, ctx)).toBe('2026-04-02');
  });

  it('upper with negative day offset', () => {
    expect(resolveConstraint({
      kind: 'upper',
      anchor: { kind: 'target-transplant' },
      offset: { amount: -7, unit: 'days' },
    }, ctx)).toBe('2026-05-08');
  });

  it('returns null when anchor cannot be resolved', () => {
    const ctxNoFirstFrost = { targetTransplantDate: '2026-05-15', actionDates: new Map<string, string>() };
    expect(resolveConstraint({
      kind: 'exact', anchor: { kind: 'first-frost' },
    }, ctxNoFirstFrost)).toBeNull();
  });
});

import { buildSchedule } from './scheduler';

describe('buildSchedule', () => {
  it('resolves a single exact action', () => {
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [{
          id: 'transplant', label: 'Transplant',
          constraints: [{ kind: 'exact', anchor: { kind: 'target-transplant' } }],
        }],
      }],
      targetTransplantDate: '2026-05-15',
    });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      plantId: 'p1', actionId: 'transplant',
      earliest: '2026-05-15', latest: '2026-05-15',
      conflicts: [],
    });
    expect(result.warnings).toEqual([]);
  });

  it('intersects lower + upper bounds into a window', () => {
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [{
          id: 'sow', label: 'Sow indoors',
          constraints: [
            { kind: 'lower', anchor: { kind: 'last-frost' }, offset: { amount: -6, unit: 'weeks' } },
            { kind: 'upper', anchor: { kind: 'last-frost' }, offset: { amount: -4, unit: 'weeks' } },
          ],
        }],
      }],
      targetTransplantDate: '2026-05-15',
      lastFrostDate: '2026-04-30',
    });
    expect(result.actions[0].earliest).toBe('2026-03-19');
    expect(result.actions[0].latest).toBe('2026-04-02');
  });

  it('flags conflicts when lower > upper', () => {
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [{
          id: 'sow', label: 'Sow',
          constraints: [
            { kind: 'lower', anchor: { kind: 'last-frost' }, offset: { amount: -2, unit: 'weeks' } },
            { kind: 'upper', anchor: { kind: 'last-frost' }, offset: { amount: -4, unit: 'weeks' } },
          ],
        }],
      }],
      targetTransplantDate: '2026-05-15',
      lastFrostDate: '2026-04-30',
    });
    expect(result.actions[0].conflicts.length).toBeGreaterThan(0);
  });

  it('topologically resolves action references', () => {
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [
          {
            id: 'harden-off', label: 'Harden off',
            constraints: [{
              kind: 'exact',
              anchor: { kind: 'action', actionId: 'transplant' },
              offset: { amount: -7, unit: 'days' },
            }],
          },
          {
            id: 'transplant', label: 'Transplant',
            constraints: [{ kind: 'exact', anchor: { kind: 'target-transplant' } }],
          },
        ],
      }],
      targetTransplantDate: '2026-05-15',
    });
    const harden = result.actions.find((a) => a.actionId === 'harden-off')!;
    expect(harden.earliest).toBe('2026-05-08');
  });

  it('drops actions referencing missing anchors and warns', () => {
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [{
          id: 'sow', label: 'Sow',
          constraints: [{ kind: 'exact', anchor: { kind: 'last-frost' } }],
        }],
      }],
      targetTransplantDate: '2026-05-15',
    });
    expect(result.actions).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('last-frost'))).toBe(true);
  });

  it('detects cycles among action refs', () => {
    const result = buildSchedule({
      plants: [{
        id: 'p1', cultivarId: 'tomato',
        actions: [
          {
            id: 'a', label: 'A',
            constraints: [{ kind: 'exact', anchor: { kind: 'action', actionId: 'b' } }],
          },
          {
            id: 'b', label: 'B',
            constraints: [{ kind: 'exact', anchor: { kind: 'action', actionId: 'a' } }],
          },
        ],
      }],
      targetTransplantDate: '2026-05-15',
    });
    expect(result.actions).toHaveLength(0);
    expect(result.warnings.some((w) => w.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('sorts output by earliest then plantId', () => {
    const result = buildSchedule({
      plants: [
        {
          id: 'p2', cultivarId: 'basil',
          actions: [{
            id: 'sow', label: 'Sow',
            constraints: [{
              kind: 'exact', anchor: { kind: 'last-frost' },
              offset: { amount: -2, unit: 'weeks' },
            }],
          }],
        },
        {
          id: 'p1', cultivarId: 'tomato',
          actions: [{
            id: 'sow', label: 'Sow',
            constraints: [{
              kind: 'exact', anchor: { kind: 'last-frost' },
              offset: { amount: -6, unit: 'weeks' },
            }],
          }],
        },
      ],
      targetTransplantDate: '2026-05-15',
      lastFrostDate: '2026-04-30',
    });
    expect(result.actions.map((a) => a.plantId)).toEqual(['p1', 'p2']);
  });
});
