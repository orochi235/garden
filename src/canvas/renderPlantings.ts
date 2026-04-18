import type { Planting, Zone } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

export function renderPlantings(
  ctx: CanvasRenderingContext2D,
  plantings: Planting[],
  zones: Zone[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number,
  highlight: boolean = false,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (plantings.length === 0) return;

  ctx.globalAlpha = opacity;

  // Build zone lookup map
  const zoneMap = new Map<string, Zone>();
  for (const zone of zones) {
    zoneMap.set(zone.id, zone);
  }

  const radius = Math.max(4, 8 * view.zoom);
  const showLabel = view.zoom >= 0.5;

  for (const p of plantings) {
    const zone = zoneMap.get(p.zoneId);
    if (!zone) continue;

    const worldX = zone.x + p.x;
    const worldY = zone.y + p.y;
    const [sx, sy] = worldToScreen(worldX, worldY, view);

    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    ctx.strokeStyle = '#2D4F3A';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (highlight) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 1, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (showLabel && p.name) {
      ctx.fillStyle = '#1A2E22';
      ctx.font = `${Math.max(9, 11 * view.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(p.name, sx, sy + radius + 2);
    }
  }

  ctx.globalAlpha = 1;
}
