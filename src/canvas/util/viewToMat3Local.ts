import type { View } from '@orochi235/weasel';

/**
 * Local replacement for weasel's internal viewToMat3 (not in 0.2.0 public API).
 * Column-major 3×3: maps world coords → screen pixels using the camera-position
 * View semantics (view.x/y is the world point at canvas origin).
 */
export function viewToMat3(view: View): [number, number, number, number, number, number, number, number, number] {
  const s = view.scale;
  return [
    s, 0, 0,
    0, s, 0,
    -view.x * s, -view.y * s, 1,
  ];
}
