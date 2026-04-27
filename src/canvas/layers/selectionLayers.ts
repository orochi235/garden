import { getCultivar } from '../../model/cultivars';
import type { Planting, Structure, Zone } from '../../model/types';
import { worldToScreen } from '../../utils/grid';
import { renderLabel } from '../renderLabel';
import type { RenderLayer } from '../renderLayer';
import type { SystemLayerData } from '../layerData';

export const SELECTION_LAYERS: RenderLayer<SystemLayerData>[] = [
  {
    id: 'selection-boxes',
    label: 'Selection Boxes',
    alwaysOn: true,
    draw(ctx, data) {
      const { selectedIds, structures, zones, plantings, view, canvasWidth, canvasHeight } = data;
      if (selectedIds.length === 0) return;

      // Build parent lookup for resolving planting world positions
      const parentMap = new Map<string, { x: number; y: number; width: number; height: number; shape?: string }>();
      for (const z of zones) parentMap.set(z.id, z);
      for (const s of structures) {
        if (s.container) parentMap.set(s.id, s);
      }

      // Render selected plantings as dashed circles
      const selectedPlantings = plantings.filter((p) => selectedIds.includes(p.id));
      for (const p of selectedPlantings) {
        const parent = parentMap.get(p.parentId);
        if (!parent) continue;
        const cultivar = getCultivar(p.cultivarId);
        const footprint = cultivar?.footprintFt ?? 0.5;
        const worldX = parent.x + p.x;
        const worldY = parent.y + p.y;
        const [sx, sy] = worldToScreen(worldX, worldY, view);
        const radius = Math.max(3, (footprint / 2) * view.zoom);

        ctx.strokeStyle = '#5BA4CF';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const allObjects: Array<{ id: string; x: number; y: number; width: number; height: number; label?: string; shape?: string }> = [...structures, ...zones];
      const selected = allObjects.filter((obj) => selectedIds.includes(obj.id));

      for (const obj of selected) {
        const [sx, sy] = worldToScreen(obj.x, obj.y, view);
        const w = obj.width * view.zoom;
        const h = obj.height * view.zoom;
        const isCircle = obj.shape === 'circle';

        // Blue dashed outline
        ctx.strokeStyle = '#5BA4CF';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        if (isCircle) {
          ctx.beginPath();
          ctx.ellipse(sx + w / 2, sy + h / 2, w / 2 + 1, h / 2 + 1, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(sx - 1, sy - 1, w + 2, h + 2);
        }
        ctx.setLineDash([]);

        // Resize handles (8 points on bounding box)
        const hs = 8;
        const handles = [
          [sx - hs / 2, sy - hs / 2],
          [sx + w / 2 - hs / 2, sy - hs / 2],
          [sx + w - hs / 2, sy - hs / 2],
          [sx + w - hs / 2, sy + h / 2 - hs / 2],
          [sx + w - hs / 2, sy + h - hs / 2],
          [sx + w / 2 - hs / 2, sy + h - hs / 2],
          [sx - hs / 2, sy + h - hs / 2],
          [sx - hs / 2, sy + h / 2 - hs / 2],
        ];
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#5BA4CF';
        ctx.lineWidth = 2;
        for (const [hx, hy] of handles) {
          ctx.fillRect(hx, hy, hs, hs);
          ctx.strokeRect(hx, hy, hs, hs);
        }

        // Label below object
        if (obj.label) {
          renderLabel(ctx, obj.label, sx + w / 2, sy + h + 8, { align: 'center', fontSize: 10 });
        }
      }
    },
  },
];
