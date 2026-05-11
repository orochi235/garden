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
