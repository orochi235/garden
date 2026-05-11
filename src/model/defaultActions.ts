/**
 * Synthesize a default ActionDef[] for a cultivar from its existing
 * SeedStartingFields. Cultivars with explicit user-authored actions
 * (future feature) skip synthesis entirely; for now every cultivar
 * goes through this.
 */
import type { Cultivar } from './cultivars';
import type { ActionDef } from './scheduler';

export function defaultActionsForCultivar(cultivar: Cultivar): ActionDef[] {
  const actions: ActionDef[] = [];
  const ss = cultivar.seedStarting;

  if (ss.weeksBeforeLastFrost !== null) {
    const [min, max] = ss.weeksBeforeLastFrost;
    actions.push({
      id: 'sow',
      label: 'Sow indoors',
      constraints: [
        { kind: 'lower', anchor: { kind: 'last-frost' }, offset: { amount: -max, unit: 'weeks' } },
        { kind: 'upper', anchor: { kind: 'last-frost' }, offset: { amount: -min, unit: 'weeks' } },
      ],
    });
    actions.push({
      id: 'harden-off',
      label: 'Harden off',
      constraints: [{
        kind: 'exact',
        anchor: { kind: 'action', actionId: 'transplant' },
        offset: { amount: -7, unit: 'days' },
      }],
    });
  }

  actions.push({
    id: 'transplant',
    label: 'Transplant outdoors',
    constraints: [{ kind: 'exact', anchor: { kind: 'target-transplant' } }],
  });

  return actions;
}
