import type { SnapStrategy } from '../../types';
import { resolveUnit, type UnitRegistry, type UnitValue } from '../../../units';

/** Snap-strategy that rounds `x`/`y` to the nearest multiple of `cell` (resolved through `registry`). */
export function gridSnapStrategy<TPose extends { x: number; y: number }>(
  cell: UnitValue,
  registry?: UnitRegistry,
): SnapStrategy<TPose> {
  const c = resolveUnit(cell, registry);
  return {
    snap(pose) {
      return {
        ...pose,
        x: Math.round(pose.x / c) * c,
        y: Math.round(pose.y / c) * c,
      };
    },
  };
}
