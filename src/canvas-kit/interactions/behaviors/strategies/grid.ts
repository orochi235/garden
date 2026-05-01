import type { SnapStrategy } from '../../types';

export function gridSnapStrategy<TPose extends { x: number; y: number }>(
  cellFt: number,
): SnapStrategy<TPose> {
  return {
    snap(pose) {
      return {
        ...pose,
        x: Math.round(pose.x / cellFt) * cellFt,
        y: Math.round(pose.y / cellFt) * cellFt,
      };
    },
  };
}
