import type { Drag, DragPointerSample, DragViewport } from './putativeDrag';
import { type DrawCommand } from '../util/weaselLocal';
import { rectPath } from '@orochi235/weasel';

/**
 * Phase-2-migrated drag: plot (rectangle) — palette plot tools that draw a
 * rectangle to insert a structure or zone.
 *
 * **Approach: Option A — façade over weasel's `useInsertTool`.** Same pattern
 * as `moveDrag` and `resizeDrag`: the actual gesture engine is `useInsertTool`
 * (built on `useInsert` + `useDragRect`). It owns pointer routing, overlay
 * state, click-vs-drag dispatch, and commit via `InsertAdapter.commitInsert`.
 *
 * `CanvasNewPrototype` mirrors `insertTool.controller.overlay` (well, the
 * tool's exposed in-flight bounds via the controller it was built from) into
 * `uiStore.dragPreview` on each frame, and this `Drag.renderPreview` becomes
 * the canonical drawer. The framework's `dragPreviewLayer` dispatches to it.
 *
 * The kit's internal `insert-overlay` screen-space marquee (drawn by
 * `defineDragInsertTool`) is suppressed by passing a fully-transparent
 * `overlayStyle` so the framework owns the visual.
 *
 * `compute` is purely informational (the framework controller never invokes
 * it for this drag — the Tool publishes putatives to the slot directly). It's
 * exported as an identity transform so the `Drag<T,U>` shape is honored and
 * tests can exercise the rendering path with a hand-rolled putative.
 *
 * `commit` is a no-op: weasel's `useInsert.end` already calls
 * `dispatchApplyBatch` → `adapter.applyBatch` → one `gardenStore.checkpoint()`
 * + one `InsertOp.apply`. Single undo step preserved.
 */

/** Which palette category drove the drag — controls preview color/style. */
export type PlotEntityKind = 'structure' | 'zone';

export interface PlotInput {
  start: { x: number; y: number };
  current: { x: number; y: number };
  entityKind: PlotEntityKind;
  /** Fill/stroke color from the active palette tool. */
  color: string;
}

/** What `CanvasNewPrototype` writes into `uiStore.dragPreview` on every move. */
export interface PlotPutative {
  start: { x: number; y: number };
  current: { x: number; y: number };
  entityKind: PlotEntityKind;
  color: string;
}

export const PLOT_DRAG_KIND = 'eric-plot';

export function createPlotDrag(): Drag<PlotInput, PlotPutative> {
  return {
    kind: PLOT_DRAG_KIND,

    // Framework controller doesn't drive this drag — useInsertTool owns the
    // pointer pipeline, and the Tool mirrors overlay → dragPreview. `read` /
    // `compute` exist to satisfy the `Drag<T, U>` contract.
    read(_sample: DragPointerSample, _viewport: DragViewport): PlotInput {
      return {
        start: { x: 0, y: 0 },
        current: { x: 0, y: 0 },
        entityKind: 'structure',
        color: '#7fb069',
      };
    },

    compute(input: PlotInput): PlotPutative | null {
      // No rectangle yet (zero-size — useInsert's minBounds gating handles
      // sub-threshold drags before a putative is published).
      if (input.start.x === input.current.x && input.start.y === input.current.y) return null;
      return {
        start: input.start,
        current: input.current,
        entityKind: input.entityKind,
        color: input.color,
      };
    },

    /**
     * Draws the in-progress rectangle as a translucent fill + dashed outline
     * using the palette tool's color. Runs in WORLD space (the framework's
     * `dragPreviewLayer` registers without `space: 'screen'`); stroke width
     * and dash sizes are scaled inversely by view to read as a constant
     * ~1px / 4px-dash outline at typical zooms — matching the kit's legacy
     * screen-space marquee defaults from `useInsertTool`.
     */
    renderPreview(putative, view): DrawCommand[] {
      const { start, current, color } = putative;
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const w = Math.abs(current.x - start.x);
      const h = Math.abs(current.y - start.y);
      if (w === 0 || h === 0) return [];

      const invScale = 1 / Math.max(0.0001, view.scale);
      const dash = 4 * invScale;
      const path = rectPath(x, y, w, h);
      return [
        { kind: 'group', alpha: 0.25, children: [
          { kind: 'path', path, fill: { fill: 'solid', color } },
        ]},
        { kind: 'path', path, stroke: { paint: { fill: 'solid', color }, width: invScale, dash: [dash, dash] } },
      ];
    },

    // No-op: the actual commit lives in `useInsert.end()` (called from the
    // kit's drag pipeline). Weasel batches the insert op into a single
    // `applyBatch` call → one `gardenStore.checkpoint()` → one undo step.
    commit(_putative: PlotPutative): void {
      // intentional: see file doc comment.
    },
  };
}
