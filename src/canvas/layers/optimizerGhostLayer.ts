import type { RenderLayer } from '@orochi235/weasel';
import type { OptimizationResult } from '../../optimizer';
import { getCultivar } from '../../model/cultivars';
import { renderPlant } from '../plantRenderers';
export function createOptimizerGhostLayer(
  getStructures: () => { id: string; x: number; y: number; width: number; length: number }[],
  getOptimizerState: () => {
    result: OptimizationResult | null;
    selectedCandidate: number;
    structureId: string | null;
  },
): RenderLayer<unknown> {
  return {
    id: 'optimizer-ghost',
    label: 'Optimizer Ghost Preview',
    defaultVisible: true,
    draw(ctx, _data, _view) {
      const { result, selectedCandidate, structureId } = getOptimizerState();
      if (!result || result.candidates.length === 0 || !structureId) return;

      const candidate = result.candidates[selectedCandidate];
      if (!candidate || candidate.placements.length === 0) return;

      const bed = getStructures().find((s) => s.id === structureId);
      if (!bed) return;

      const IN_TO_FT = 1 / 12;

      for (const placement of candidate.placements) {
        const worldX = bed.x + placement.xIn * IN_TO_FT;
        const worldY = bed.y + placement.yIn * IN_TO_FT;

        const cultivar = getCultivar(placement.cultivarId);
        const radius = cultivar ? (cultivar.footprintFt / 2) : 0.25;
        const color = cultivar ? (cultivar.color ?? '#4a90e2') : '#4a90e2';

        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.translate(worldX, worldY);
        renderPlant(ctx, placement.cultivarId, radius, color);
        ctx.restore();
      }
    },
  };
}
