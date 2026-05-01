import type { ModifierState, MoveBehavior } from '../types';
import { snap } from './snap';
import { gridSnapStrategy } from './strategies/grid';

type ModKey = keyof ModifierState;

export function snapToGrid<TPose extends { x: number; y: number }>(args: {
  cell: number;
  bypassKey?: ModKey;
}): MoveBehavior<TPose> {
  return snap(gridSnapStrategy<TPose>(args.cell), { bypassKey: args.bypassKey });
}
