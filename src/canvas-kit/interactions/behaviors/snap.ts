import type { MoveBehavior, ModifierState, SnapStrategy } from '../types';

type ModKey = keyof ModifierState;

export function snap<TPose extends { x: number; y: number }>(
  strategy: SnapStrategy<TPose>,
  opts: { bypassKey?: ModKey } = {},
): MoveBehavior<TPose> {
  const { bypassKey } = opts;
  return {
    onMove(ctx, proposed) {
      if (bypassKey && ctx.modifiers[bypassKey]) return;
      const snapped = strategy.snap(proposed, ctx);
      if (snapped === null) return;
      return { pose: snapped };
    },
  };
}
