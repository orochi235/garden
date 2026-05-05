import type { RenderLayer } from '@orochi235/weasel';
import type { OptimizationResult } from '../../optimizer';
import { getCultivar } from '../../model/cultivars';

/**
 * Renders a ghost preview of the currently selected optimizer candidate.
 * Draws semi-transparent circles over the bed, using the cultivar's color.
 * Only renders when `uiStore.optimizerResult` is non-null.
 */
export function createOptimizerGhostLayer(
  getStructures: () => { id: string; x: number; y: number; width: number; length: number }[],
  getOptimizerState: () => { result: OptimizationResult | null; selectedCandidate: number },
): RenderLayer<unknown> {
  return {
    id: 'optimizer-ghost',
    label: 'Optimizer Ghost Preview',
    defaultVisible: true,
    draw(ctx, _data, _view) {
      const { result, selectedCandidate } = getOptimizerState();
      if (!result || result.candidates.length === 0) return;

      const candidate = result.candidates[selectedCandidate];
      if (!candidate || candidate.placements.length === 0) return;

      const structures = getStructures();
      const IN_TO_FT = 1 / 12;

      for (const placement of candidate.placements) {
        // We draw relative to world — find which bed owns this placement
        // by checking all beds (the adapter stores bed-local coords)
        // Since placements are bed-local (inches), we need a bed context.
        // The ghost layer doesn't know which bed - draw all placements relative
        // to the first raised-bed structure that's selected in the UI (approximate).
        // A more precise approach would pass structureId along; for now use
        // the fact that we track optimizer state per the selected bed.
        const raisedBed = structures.find((s) => (s as any).type === 'raised-bed');
        if (!raisedBed) continue;

        const worldX = raisedBed.x + placement.xIn * IN_TO_FT;
        const worldY = raisedBed.y + placement.yIn * IN_TO_FT;

        const cultivar = getCultivar(placement.cultivarId);
        const radius = cultivar ? (cultivar.footprintFt / 2) : 0.25;
        const color = cultivar ? (cultivar.color ?? '#4a90e2') : '#4a90e2';

        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(worldX, worldY, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.04;
        ctx.stroke();
        ctx.restore();
      }
    },
  };
}
