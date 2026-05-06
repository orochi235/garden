import type { Drag, DragPointerSample, DragViewport } from './putativeDrag';

/**
 * Phase-2-migrated drag: area-select marquee — the rubber-band rectangle drawn
 * while the user drags on empty canvas to select multiple objects.
 *
 * **Approach: Option A — façade over weasel's `useAreaSelect`.** Same pattern
 * as `moveDrag` / `resizeDrag` / `plotDrag`: the actual gesture engine is
 * `useAreaSelect` inside `useEricSelectTool` (it owns gesture state and runs
 * `selectFromMarquee` on end). `useEricSelectTool` mirrors the live
 * `areaSelect.overlay` into `uiStore.dragPreview` on every frame, and this
 * `Drag.renderPreview` becomes the canonical drawer; the framework's
 * `dragPreviewLayer` dispatches to it.
 *
 * The legacy marquee was drawn by `eric-select-overlay`'s screen-space
 * `RenderLayer` in `useEricSelectTool`; that block is removed once the façade
 * is wired.
 *
 * `compute` is purely informational (the framework controller never invokes
 * it for this drag — the Tool publishes putatives to the slot directly). It's
 * exported as an identity transform so the `Drag<T,U>` shape is honored and
 * tests can exercise the rendering path with a hand-rolled putative.
 *
 * `commit` is a no-op: the actual selection commit lives in
 * `useAreaSelect.end()`'s behaviors (`selectFromMarquee`), which mutates
 * `useUiStore.selectedIds`. There's no garden-state mutation, so no checkpoint
 * is needed. Selection is not part of the undo stack.
 */

export interface AreaSelectInput {
  start: { x: number; y: number };
  current: { x: number; y: number };
  shiftHeld: boolean;
}

/** What `useEricSelectTool` writes into `uiStore.dragPreview` on every move. */
export interface AreaSelectPutative {
  /** Marquee start point in world coords (where the drag began). */
  start: { x: number; y: number };
  /** Marquee current point in world coords (live pointer). */
  current: { x: number; y: number };
  /** Whether shift was held at gesture start (additive selection). */
  shiftHeld: boolean;
}

export const AREA_SELECT_DRAG_KIND = 'eric-area-select';

export function createAreaSelectDrag(): Drag<AreaSelectInput, AreaSelectPutative> {
  return {
    kind: AREA_SELECT_DRAG_KIND,

    // Framework controller doesn't drive this drag — useEricSelectTool owns
    // the gesture and mirrors overlay → dragPreview. `read` / `compute` exist
    // to satisfy the `Drag<T, U>` contract.
    read(_sample: DragPointerSample, _viewport: DragViewport): AreaSelectInput {
      return {
        start: { x: 0, y: 0 },
        current: { x: 0, y: 0 },
        shiftHeld: false,
      };
    },

    compute(input: AreaSelectInput): AreaSelectPutative | null {
      // Zero-extent rectangle (gesture hasn't moved off the start point yet) —
      // suppress so the layer doesn't draw a degenerate stroke.
      if (input.start.x === input.current.x && input.start.y === input.current.y) {
        return null;
      }
      return {
        start: input.start,
        current: input.current,
        shiftHeld: input.shiftHeld,
      };
    },

    /**
     * Draws the marquee — translucent fill (#5BA4CF @ 15%) + dashed 1px
     * outline (#5BA4CF), matching the legacy screen-space rendering exactly.
     * Runs in WORLD space (the framework's `dragPreviewLayer` registers
     * without `space: 'screen'`); stroke width and dash sizes are scaled
     * inversely by view to read as constant 1px stroke / 3px dashes at
     * typical zooms — the same look the legacy screen-space layer produced.
     *
     * Inverted rects (current point above-and-left of start) render correctly
     * via Math.min / Math.abs.
     */
    renderPreview(ctx, putative, view): void {
      const { start, current } = putative;
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const w = Math.abs(current.x - start.x);
      const h = Math.abs(current.y - start.y);
      if (w === 0 || h === 0) return;

      const invScale = 1 / Math.max(0.0001, view.scale);
      ctx.save();
      ctx.fillStyle = 'rgba(91, 164, 207, 0.15)';
      ctx.strokeStyle = '#5BA4CF';
      ctx.lineWidth = 1 * invScale;
      const dash = 3 * invScale;
      ctx.setLineDash([dash, dash]);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.restore();
    },

    // No-op: selection commit lives in `useAreaSelect.end()` (called from
    // `useEricSelectTool`'s `drag.onEnd`). Selection state is not part of the
    // garden undo stack.
    commit(_putative: AreaSelectPutative): void {
      // intentional: see file doc comment.
    },
  };
}
