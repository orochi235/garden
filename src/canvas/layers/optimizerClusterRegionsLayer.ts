import type { RenderLayer } from '@orochi235/weasel';
import type { OptimizationResult } from '../../optimizer';

/**
 * Debug overlay (gated by `?debug=clusters`): when an optimizer candidate is
 * being previewed and that candidate came from `solveClustered`, draw the
 * cluster sub-bed rectangles in the parent bed's local coordinate system,
 * shaded translucent with a deterministic per-cluster-key colour, and
 * label each region with its key.
 *
 * Diagnostic aid only — not user-facing.
 */
export function createOptimizerClusterRegionsLayer(
  getStructures: () => { id: string; x: number; y: number; width: number; length: number }[],
  getOptimizerState: () => {
    result: OptimizationResult | null;
    selectedCandidate: number;
    structureId: string | null;
  },
): RenderLayer<unknown> {
  return {
    id: 'debug-optimizer-cluster-regions',
    label: 'Debug: Optimizer Cluster Regions',
    alwaysOn: true,
    draw(ctx, _data, view) {
      const { result, selectedCandidate, structureId } = getOptimizerState();
      if (!result || result.candidates.length === 0 || !structureId) return;
      const candidate = result.candidates[selectedCandidate];
      if (!candidate || !candidate.clusterRegions || candidate.clusterRegions.length === 0) return;

      const bed = getStructures().find((s) => s.id === structureId);
      if (!bed) return;

      const IN_TO_FT = 1 / 12;
      const px = (n: number) => n / Math.max(0.0001, view.scale);

      ctx.save();
      for (const region of candidate.clusterRegions) {
        const x = bed.x + region.offsetIn.x * IN_TO_FT;
        const y = bed.y + region.offsetIn.y * IN_TO_FT;
        const w = region.widthIn * IN_TO_FT;
        const h = region.lengthIn * IN_TO_FT;
        const hue = hashHue(region.key);
        const fill = `hsla(${hue}, 70%, 50%, 0.20)`;
        const stroke = `hsla(${hue}, 80%, 35%, 0.9)`;
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = px(1.5);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);

        // Label with cluster key, top-left padded.
        const fontPx = 12;
        ctx.font = `${px(fontPx)}px sans-serif`;
        ctx.textBaseline = 'top';
        const padding = px(4);
        const text = region.key;
        const metrics = ctx.measureText(text);
        const bgW = metrics.width + padding * 2;
        const bgH = px(fontPx) + padding * 2;
        ctx.fillStyle = `hsla(${hue}, 80%, 25%, 0.85)`;
        ctx.fillRect(x + padding, y + padding, bgW, bgH);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, x + padding * 2, y + padding * 2);
      }
      ctx.restore();
    },
  };
}

/** Deterministic string → hue (0–360) for distinct per-cluster colors. */
function hashHue(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}
