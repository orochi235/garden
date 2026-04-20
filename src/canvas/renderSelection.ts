import type { Structure, StructureShape, Zone } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

interface SelectableObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  shape?: StructureShape;
}

export function renderSelection(
  ctx: CanvasRenderingContext2D,
  selectedIds: string[],
  structures: Structure[],
  zones: Zone[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (selectedIds.length === 0) return;

  const allObjects: SelectableObject[] = [...structures, ...zones];
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
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      const textX = sx + w / 2;
      const textY = sy + h + 8;
      const metrics = ctx.measureText(obj.label);
      ctx.fillRect(textX - metrics.width / 2 - 3, textY - 1, metrics.width + 6, 14);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(obj.label, textX, textY);
    }
  }
}
