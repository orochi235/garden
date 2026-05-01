import type { SnapStrategy } from '../../types';

export function gridSnapStrategy<TPose extends { x: number; y: number }>(
  cell: number,
): SnapStrategy<TPose> {
  return {
    snap(pose) {
      return {
        ...pose,
        x: Math.round(pose.x / cell) * cell,
        y: Math.round(pose.y / cell) * cell,
      };
    },
  };
}
