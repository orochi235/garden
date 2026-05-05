import type { RenderLayer } from '@orochi235/weasel';
import type { Tray } from '../../model/seedStarting';
import { trayInteriorOffsetIn } from '../../model/seedStarting';
import { trayWorldOrigin } from '../adapters/seedStartingScene';
import { useGardenStore } from '../../store/gardenStore';
import type { View } from './worldLayerData';

export type GetTrays = () => Tray[];

function withTrayTransform(
  ctx: CanvasRenderingContext2D,
  tray: Tray,
  draw: () => void,
): void {
  const ss = useGardenStore.getState().garden.seedStarting;
  const o = trayWorldOrigin(tray, ss);
  ctx.save();
  ctx.translate(o.x, o.y);
  draw();
  ctx.restore();
}

function px(view: View, p: number): number {
  return p / Math.max(0.0001, view.scale);
}

function drawTrayBody(ctx: CanvasRenderingContext2D, tray: Tray, view: View): void {
  const w = tray.widthIn;
  const h = tray.heightIn;
  const radius = Math.min(w, h) * 0.04;

  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, radius);
  ctx.fill();

  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = px(view, 1);
  ctx.stroke();
}

function drawTrayWells(ctx: CanvasRenderingContext2D, tray: Tray, view: View): void {
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const wellRadius = p * 0.4;

  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      const cx = off.x + c * p + p / 2;
      const cy = off.y + r * p + p / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.arc(cx, cy, wellRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = px(view, 1);
      ctx.stroke();
    }
  }
}

function drawTrayGrid(ctx: CanvasRenderingContext2D, tray: Tray): void {
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const dotRadius = p * 0.06;

  ctx.fillStyle = 'rgba(91,164,207,0.5)';
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      const cx = off.x + c * p + p / 2;
      const cy = off.y + r * p + p / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function createTrayLayers(getTrays: GetTrays): RenderLayer<unknown>[] {
  return [
    {
      id: 'tray-body',
      label: 'Tray Body',
      alwaysOn: true,
      draw(ctx, _data, view) {
        for (const tray of getTrays()) {
          withTrayTransform(ctx, tray, () => drawTrayBody(ctx, tray, view));
        }
      },
    },
    {
      id: 'tray-wells',
      label: 'Tray Wells',
      draw(ctx, _data, view) {
        for (const tray of getTrays()) {
          withTrayTransform(ctx, tray, () => drawTrayWells(ctx, tray, view));
        }
      },
    },
    {
      id: 'tray-grid',
      label: 'Tray Grid',
      defaultVisible: true,
      draw(ctx, _data, _view) {
        for (const tray of getTrays()) {
          withTrayTransform(ctx, tray, () => drawTrayGrid(ctx, tray));
        }
      },
    },
  ];
}
