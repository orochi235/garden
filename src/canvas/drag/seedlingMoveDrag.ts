import type { Drag, DragPointerSample, DragViewport } from './putativeDrag';
import { type DrawCommand, circlePolygon } from '../util/weaselLocal';
import { useGardenStore } from '../../store/gardenStore';
import { getCultivar } from '../../model/cultivars';
import { trayInteriorOffsetIn } from '../../model/nursery';
import { trayWorldOrigin } from '../adapters/seedStartingScene';

/**
 * Phase-2-migrated drag: seed-mode multi-seedling move ghost — the resolved
 * target-cell preview shown while the user drags a multi-select set of
 * seedlings around a tray.
 *
 * **Approach: Option A — façade over the kit Tool gesture.** Same pattern as
 * `moveDrag` / `resizeDrag` / `plotDrag` / `areaSelectDrag`: the gesture engine
 * is `useSeedlingMoveTool`; it owns scratch state, runs the group-move
 * resolver on every move, and applies the result on `drag.onEnd`. The Tool
 * mirrors its computed `seedMovePreview`-shaped overlay state into
 * `uiStore.dragPreview` via a `useEffect`, and this `Drag.renderPreview`
 * becomes the canonical drawer; the framework's `dragPreviewLayer` dispatches
 * to it.
 *
 * The legacy `seedling-move-preview` render layer (in
 * `seedlingLayersWorld.ts`) drew from a dedicated `uiStore.seedMovePreview`
 * slot. With this migration both the slot and the layer are deleted — the
 * shared `dragPreview` slot replaces them.
 *
 * `compute` is purely informational (the framework controller never invokes
 * it for this drag — the Tool publishes putatives to the slot directly). It's
 * exported as an identity transform so the `Drag<T,U>` shape is honored and
 * tests can exercise the rendering path with a hand-rolled putative.
 *
 * `commit` is a no-op: the actual seedling state mutation is handled by
 * `useSeedlingMoveTool`'s `drag.onEnd` (calling `gardenStore.moveSeedlingGroup`
 * inside one history checkpoint). One undo step preserved.
 */

export interface SeedlingMoveCell {
  row: number;
  col: number;
  cultivarId: string;
  bumped: boolean;
}

export interface SeedlingMoveInput {
  trayId: string;
  feasible: boolean;
  cells: SeedlingMoveCell[];
}

export interface SeedlingMovePutative {
  /** The tray inside which the group is being moved. */
  trayId: string;
  /** Whether the resolved layout is feasible (no clashes / out-of-bounds). */
  feasible: boolean;
  /** Per-seedling resolved target cells. `bumped` flags cells that were
   *  pushed by the resolver to make room for the dragged set. */
  cells: SeedlingMoveCell[];
}

export const SEEDLING_MOVE_DRAG_KIND = 'eric-seedling-move';

export function createSeedlingMoveDrag(): Drag<SeedlingMoveInput, SeedlingMovePutative> {
  return {
    kind: SEEDLING_MOVE_DRAG_KIND,

    // Framework controller doesn't drive this drag — useSeedlingMoveTool owns
    // the gesture and mirrors overlay → dragPreview. `read` / `compute` exist
    // to satisfy the `Drag<T, U>` contract and keep tests easy.
    read(_sample: DragPointerSample, _viewport: DragViewport): SeedlingMoveInput {
      return { trayId: '', feasible: true, cells: [] };
    },

    compute(input: SeedlingMoveInput): SeedlingMovePutative | null {
      if (!input.trayId || input.cells.length === 0) return null;
      return {
        trayId: input.trayId,
        feasible: input.feasible,
        cells: input.cells.map((c) => ({ ...c })),
      };
    },

    /**
     * Draws the per-cell ghost layout: translucent cultivar icon at each
     * resolved target cell, dashed goldenrod ring on `bumped` cells, and a
     * red infeasibility ring stroked over every cell when the resolved
     * layout can't fit.
     *
     * Runs in WORLD space (the framework's `dragPreviewLayer` registers
     * without `space: 'screen'`). Cell centers are computed in tray-local
     * inches via `trayInteriorOffsetIn`, then translated by the tray's world
     * origin (so multi-tray gardens render at the right place).
     *
     * Visual must match the legacy `drawMovePreview` in
     * `seedlingLayersWorld.ts` exactly — same alpha (0.6 / 0.35), same dashes,
     * same colors, same radius.
     */
    renderPreview(putative, view): DrawCommand[] {
      const ss = useGardenStore.getState().garden.nursery;
      const tray = ss.trays.find((t) => t.id === putative.trayId);
      if (!tray || putative.cells.length === 0) return [];

      const o = trayWorldOrigin(tray, ss);
      const off = trayInteriorOffsetIn(tray);
      const p = tray.cellPitchIn;
      const radius = (p * 0.85) / 2;
      const invScale = 1 / Math.max(0.0001, view.scale);
      const alpha = putative.feasible ? 0.6 : 0.35;

      const cellGlyphs: DrawCommand[] = [];
      for (const m of putative.cells) {
        const cultivar = getCultivar(m.cultivarId);
        if (!cultivar) continue;
        const cx = o.x + off.x + m.col * p + p / 2;
        const cy = o.y + off.y + m.row * p + p / 2;
        const bgColor = cultivar.iconBgColor ?? cultivar.color ?? '#4A7C59';
        const path = circlePolygon(cx, cy, radius);
        cellGlyphs.push(
          { kind: 'path', path, fill: { fill: 'solid', color: bgColor } },
          { kind: 'path', path, stroke: { paint: { fill: 'solid', color: cultivar.color ?? '#4A7C59' }, width: Math.max(invScale, radius * 0.06) } },
        );
      }

      const cmds: DrawCommand[] = [{ kind: 'group', alpha, children: cellGlyphs }];

      if (!putative.feasible) {
        const infeasibleRings: DrawCommand[] = [];
        for (const m of putative.cells) {
          const cx = o.x + off.x + m.col * p + p / 2;
          const cy = o.y + off.y + m.row * p + p / 2;
          infeasibleRings.push({ kind: 'path', path: circlePolygon(cx, cy, radius + 2.5 * invScale), stroke: { paint: { fill: 'solid', color: 'rgba(220, 60, 60, 0.7)' }, width: 2 * invScale } });
        }
        cmds.push(...infeasibleRings);
      }

      return cmds;
    },

    // No-op: the actual seedling state mutation lives in
    // `useSeedlingMoveTool`'s `drag.onEnd` (single `gardenStore.moveSeedlingGroup`
    // call inside one history checkpoint).
    commit(_putative: SeedlingMovePutative): void {
      // intentional: see file doc comment.
    },
  };
}
