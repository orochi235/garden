import { describe, expect, it } from 'vitest';
import { defaultActionsForCultivar } from './defaultActions';
import { getCultivar } from './cultivars';

describe('defaultActionsForCultivar', () => {
  it('emits sow + harden-off + transplant for a cultivar with weeksBeforeLastFrost', () => {
    const c = getCultivar('tomato.brandywine');
    if (!c) throw new Error('test fixture missing');
    const actions = defaultActionsForCultivar(c);
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('transplant');
    if (c.seedStarting.weeksBeforeLastFrost !== null) {
      expect(ids).toContain('sow');
      expect(ids).toContain('harden-off');
    }
  });

  it('always emits transplant on target-transplant', () => {
    const c = getCultivar('tomato.brandywine')!;
    const actions = defaultActionsForCultivar(c);
    const transplant = actions.find((a) => a.id === 'transplant')!;
    expect(transplant.constraints).toEqual([
      { kind: 'exact', anchor: { kind: 'target-transplant' } },
    ]);
  });

  it('sow window uses weeksBeforeLastFrost.min and .max as upper/lower', () => {
    const c = getCultivar('tomato.brandywine')!;
    if (c.seedStarting.weeksBeforeLastFrost === null) {
      return;
    }
    const [min, max] = c.seedStarting.weeksBeforeLastFrost;
    const actions = defaultActionsForCultivar(c);
    const sow = actions.find((a) => a.id === 'sow')!;
    expect(sow.constraints).toContainEqual({
      kind: 'lower', anchor: { kind: 'last-frost' }, offset: { amount: -max, unit: 'weeks' },
    });
    expect(sow.constraints).toContainEqual({
      kind: 'upper', anchor: { kind: 'last-frost' }, offset: { amount: -min, unit: 'weeks' },
    });
  });

  it('harden-off is exact 7 days before transplant', () => {
    const c = getCultivar('tomato.brandywine')!;
    if (c.seedStarting.weeksBeforeLastFrost === null) return;
    const actions = defaultActionsForCultivar(c);
    const ho = actions.find((a) => a.id === 'harden-off')!;
    expect(ho.constraints).toEqual([{
      kind: 'exact',
      anchor: { kind: 'action', actionId: 'transplant' },
      offset: { amount: -7, unit: 'days' },
    }]);
  });
});
