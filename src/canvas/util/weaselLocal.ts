import type { RenderLayer, View } from '@orochi235/weasel';

/**
 * Local replacement for weasel's internal `viewToMat3` (not in 0.2.0 public API).
 * Column-major 3×3: maps world coords → screen pixels using the camera-position
 * View semantics (view.x/y is the world point at canvas origin).
 */
export function viewToMat3(view: View): Float32Array {
  const s = view.scale;
  return new Float32Array([
    s, 0, 0,
    0, s, 0,
    -view.x * s, -view.y * s, 1,
  ]);
}

/**
 * `DrawCommand` is declared in weasel's .d.ts but not in the public export block
 * (0.2.0 oversight). Derive it structurally from `RenderLayer.draw`'s return type
 * so layer files can import it from one place.
 */
export type DrawCommand = ReturnType<RenderLayer<unknown>['draw']>[number];

/**
 * `TextureHandle` is also declared but not exported. Derive it from the pattern
 * factory return shape.
 */
import { createTilePattern } from '@orochi235/weasel';
export type TextureHandle = NonNullable<ReturnType<typeof createTilePattern>>;
