import type { Structure, Zone } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

interface SelectableObject { id: string; x: number; y: number; width: number; height: number; }

export function renderSelection(
  ctx: CanvasRenderingContext2D,
  selectedIds: string[],
  structures: Structure[], zones: Zone[],
  view: ViewTransform,
  canvasWidth: number, canvasHeight: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (selectedIds.length === 0) return;

  const allObjects: SelectableObject[] = [...structures, ...zones];
  const selected = allObjects.filter((obj) => selectedIds.includes(obj.id));

  for (const obj of selected) {
    const [sx, sy] = worldToScreen(obj.x, obj.y, view);
    const w = obj.width * view.zoom;
    const h = obj.height * view.zoom;

    // Blue dashed outline
    ctx.strokeStyle = '#5BA4CF';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(sx - 1, sy - 1, w + 2, h + 2);
    ctx.setLineDash([]);

    // Resize handles (8 points)
    const hs = 8;
    const handles = [
      [sx - hs/2, sy - hs/2], [sx + w/2 - hs/2, sy - hs/2], [sx + w - hs/2, sy - hs/2],
      [sx + w - hs/2, sy + h/2 - hs/2],
      [sx + w - hs/2, sy + h - hs/2], [sx + w/2 - hs/2, sy + h - hs/2],
      [sx - hs/2, sy + h - hs/2], [sx - hs/2, sy + h/2 - hs/2],
    ];
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#5BA4CF';
    ctx.lineWidth = 2;
    for (const [hx, hy] of handles) {
      ctx.fillRect(hx, hy, hs, hs);
      ctx.strokeRect(hx, hy, hs, hs);
    }
  }
}
