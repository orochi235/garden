import { getCultivar } from '../model/cultivars';
import type { Planting, Structure, Zone } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';
import { renderPlant } from './plantRenderers';

interface PlantingParent {
  x: number;
  y: number;
}

interface RenderedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: RenderedRect, b: RenderedRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function renderPlantings(
  ctx: CanvasRenderingContext2D,
  plantings: Planting[],
  zones: Zone[],
  structures: Structure[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  highlightOpacity: number = 0,
  selectedIds: string[] = [],
  showSpacing: boolean = false,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (plantings.length === 0) return;

  // Build parent lookup map from zones and container structures
  const parentMap = new Map<string, PlantingParent>();
  for (const zone of zones) {
    parentMap.set(zone.id, zone);
  }
  for (const s of structures) {
    if (s.container) parentMap.set(s.id, s);
  }

  const showLabel = view.zoom >= 0.5;
  ctx.font = '13px sans-serif';

  // Collect occupied rects from structures and zones
  const occupied: RenderedRect[] = [];
  for (const s of structures) {
    const [sx2, sy2] = worldToScreen(s.x, s.y, view);
    occupied.push({ x: sx2, y: sy2, w: s.width * view.zoom, h: s.height * view.zoom });
  }
  for (const z of zones) {
    const [zx, zy] = worldToScreen(z.x, z.y, view);
    occupied.push({ x: zx, y: zy, w: z.width * view.zoom, h: z.height * view.zoom });
  }

  // First pass: render plants and collect their bounding rects
  const labelCandidates: { text: string; rect: RenderedRect; selected: boolean }[] = [];

  for (const p of plantings) {
    const parent = parentMap.get(p.parentId);
    if (!parent) continue;
    const cultivar = getCultivar(p.cultivarId);
    const color = cultivar?.color ?? '#4A7C59';
    const footprint = cultivar?.footprintFt ?? 0.5;
    const spacing = cultivar?.spacingFt ?? 0.5;

    const worldX = parent.x + p.x;
    const worldY = parent.y + p.y;
    const [sx, sy] = worldToScreen(worldX, worldY, view);
    const radius = Math.max(3, (footprint / 2) * view.zoom);

    if (showSpacing) {
      const spacingRadius = (spacing / 2) * view.zoom;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, spacingRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, sy);
    renderPlant(ctx, p.cultivarId, radius, color);
    ctx.restore();

    if (highlightOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = highlightOpacity;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Track the plant's bounding box
    occupied.push({ x: sx - radius, y: sy - radius, w: radius * 2, h: radius * 2 });

    const labelText = p.label || cultivar?.name || p.cultivarId;
    if ((showLabel || highlightOpacity > 0) && labelText) {
      const labelW = ctx.measureText(labelText).width;
      const labelH = 13;
      const labelX = sx - labelW / 2;
      const labelY = sy + radius + 8;
      labelCandidates.push({
        text: labelText,
        rect: { x: labelX, y: labelY, w: labelW, h: labelH },
        selected: selectedIds.includes(p.id),
      });
    }
  }

  // Second pass: render labels that don't overlap other objects
  ctx.fillStyle = '#1A2E22';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  for (const label of labelCandidates) {
    if (!label.selected) {
      const overlaps = occupied.some((r) => rectsOverlap(label.rect, r));
      if (overlaps) continue;
    }
    ctx.fillText(label.text, label.rect.x, label.rect.y);
    // Add label to occupied so later labels don't overlap it either
    occupied.push(label.rect);
  }

}
