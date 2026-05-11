import { describe, it, expect } from 'vitest';
import type { Constraint, ActionDef, ScheduleInputs } from './scheduler';

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
