import type { Arrangement } from '../model/arrangement';
import { getCultivar } from '../model/cultivars';
import type { Planting, Structure, Zone } from '../model/types';
import { worldToScreen } from '@orochi235/weasel';
import type { OverlayRenderOptions } from './renderOptions';
import { renderPlant } from './plantRenderers';

interface PlantingParent {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: string;
  arrangement: Arrangement | null;
  wallThicknessFt?: number;
}

export function renderOverlayPlantings(
  ctx: CanvasRenderingContext2D,
  plantings: Planting[],
  zones: Zone[],
  structures: Structure[],
  opts: OverlayRenderOptions,
): void {
  const { view, snapped } = opts;

  if (plantings.length === 0) return;

  // Build parent lookup map from zones and container structures
  const parentMap = new Map<string, PlantingParent>();
  for (const zone of zones) {
    parentMap.set(zone.id, zone);
  }
  for (const s of structures) {
    if (s.container) parentMap.set(s.id, s);
  }

  // Count plantings per parent to detect single-plant containers
  const childCount = new Map<string, number>();
  for (const p of plantings) {
    childCount.set(p.parentId, (childCount.get(p.parentId) ?? 0) + 1);
  }

  // Group by parent for container clipping
  const plantingsByParent = new Map<string, Planting[]>();
  for (const p of plantings) {
    const group = plantingsByParent.get(p.parentId) ?? [];
    group.push(p);
    plantingsByParent.set(p.parentId, group);
  }

  for (const [parentId, group] of plantingsByParent) {
    const parent = parentMap.get(parentId);
    if (!parent) continue;

    const wall = parent.wallThicknessFt ?? 0;
    // Free-agent during drag: when not snapped, planting is detached from any
    // container, so don't clip to the (former) parent's walls.
    const clipped = wall > 0 && snapped;
    if (clipped) {
      ctx.save();
      const [psx, psy] = worldToScreen(parent.x, parent.y, view);
      const psw = parent.width * view.zoom;
      const psh = parent.height * view.zoom;
      ctx.beginPath();
      if (parent.shape === 'circle') {
        const rimWidth = Math.max(1.5, wall * view.zoom);
        const cx = psx + psw / 2;
        const cy = psy + psh / 2;
        const r = Math.min(psw, psh) / 2 - rimWidth;
        ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2);
      } else {
        const wallWidth = Math.max(2, wall * view.zoom);
        ctx.rect(psx + wallWidth, psy + wallWidth, psw - wallWidth * 2, psh - wallWidth * 2);
      }
      ctx.clip();
    }

    for (const p of group) {
      const cultivar = getCultivar(p.cultivarId);
      const color = cultivar?.color ?? '#4A7C59';
      const footprint = cultivar?.footprintFt ?? 0.5;

      const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;

      // Overlay plantings already have world coords — don't add parent offset
      const worldX = p.x;
      const worldY = p.y;
      const [sx, sy] = worldToScreen(worldX, worldY, view);
      const radius = isSingleFill
        ? Math.max(3, (Math.min(parent.width, parent.height) / 2) * view.zoom)
        : Math.max(3, (footprint / 2) * view.zoom);

      const cultivarBgColor = cultivar?.iconBgColor ?? null;
      ctx.save();
      ctx.globalAlpha = snapped ? 0.4 : 0.5;
      ctx.translate(sx, sy);
      renderPlant(ctx, p.cultivarId, radius, color, cultivarBgColor);
      ctx.restore();

      if (snapped) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    if (clipped) {
      ctx.restore();
    }
  }
}
