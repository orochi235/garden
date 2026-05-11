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
