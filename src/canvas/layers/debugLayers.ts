import type { RenderLayer } from '@orochi235/weasel';
import type { Garden } from '../../model/types';
import { trayInteriorOffsetIn } from '../../model/seedStarting';
import { isDebugEnabled } from '../debug';

type Mode = 'garden' | 'seed-starting';

interface Bbox { x: number; y: number; w: number; h: number; label?: string }

function bboxesGarden(g: Garden): Bbox[] {
  const out: Bbox[] = [];
  for (const s of g.structures) {
    out.push({ x: s.x, y: s.y, w: s.width, h: s.height, label: s.label || s.type });
  }
  for (const z of g.zones) {
    out.push({ x: z.x, y: z.y, w: z.width, h: z.height, label: z.label });
  }
  return out;
}

function bboxesSeedStarting(g: Garden): Bbox[] {
  // Tray world origin is (0,0) (see seedStartingScene adapter).
  const trays = g.seedStarting.trays;
  const out: Bbox[] = [];
  for (const t of trays) {
    out.push({ x: 0, y: 0, w: t.widthIn, h: t.heightIn, label: t.label || t.id });
    const off = trayInteriorOffsetIn(t);
    for (let r = 0; r < t.rows; r++) {
      for (let c = 0; c < t.cols; c++) {
        out.push({
          x: off.x + c * t.cellPitchIn,
          y: off.y + r * t.cellPitchIn,
          w: t.cellPitchIn,
          h: t.cellPitchIn,
        });
      }
    }
  }
  return out;
}

function makeHitboxLayer(mode: Mode, getGarden: () => Garden): RenderLayer<unknown> {
  return {
    id: 'debug-hitboxes',
    label: 'Debug: Hitboxes',
    alwaysOn: true,
    draw(ctx, _data, view) {
      const g = getGarden();
      const items = mode === 'garden' ? bboxesGarden(g) : bboxesSeedStarting(g);
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#ff0040';
      ctx.lineWidth = 1 / Math.max(0.0001, view.scale);
      for (const b of items) ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    },
  };
}

function makeBoundsLayer(mode: Mode, getGarden: () => Garden): RenderLayer<unknown> {
  return {
    id: 'debug-bounds',
    label: 'Debug: Bounds',
    alwaysOn: true,
    draw(ctx, _data, view) {
      const g = getGarden();
      let x: number, y: number, w: number, h: number;
      if (mode === 'garden') {
        x = 0; y = 0; w = g.widthFt; h = g.heightFt;
      } else {
        const t = g.seedStarting.trays[0];
        if (!t) return;
        x = 0; y = 0; w = t.widthIn; h = t.heightIn;
      }
      ctx.save();
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2 / Math.max(0.0001, view.scale);
      ctx.setLineDash([4 / view.scale, 4 / view.scale]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    },
  };
}

function makeAxesLayer(): RenderLayer<unknown> {
  return {
    id: 'debug-axes',
    label: 'Debug: Axes',
    alwaysOn: true,
    draw(ctx, _data, view) {
      const px = (n: number) => n / Math.max(0.0001, view.scale);
      ctx.save();
      // X axis (red), Y axis (green) from origin extending 100 world units.
      ctx.lineWidth = px(2);
      ctx.strokeStyle = '#ff4040';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(100, 0); ctx.stroke();
      ctx.strokeStyle = '#40ff40';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 100); ctx.stroke();
      // Origin dot.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, px(4), 0, Math.PI * 2); ctx.fill();
      // Labels.
      ctx.fillStyle = '#ffffff';
      ctx.font = `${px(12)}px sans-serif`;
      ctx.fillText('+x', 100 - px(20), -px(4));
      ctx.fillText('+y', px(4), 100 - px(4));
      ctx.fillText('(0,0)', px(6), -px(6));
      ctx.restore();
    },
  };
}

function makeGridLayer(mode: Mode, getGarden: () => Garden): RenderLayer<unknown> {
  return {
    id: 'debug-grid',
    label: 'Debug: Grid',
    alwaysOn: true,
    draw(ctx, _data, view) {
      const g = getGarden();
      let step: number, w: number, h: number;
      if (mode === 'garden') {
        step = g.gridCellSizeFt; w = g.widthFt; h = g.heightFt;
      } else {
        const t = g.seedStarting.trays[0];
        if (!t) return;
        step = t.cellPitchIn; w = t.widthIn; h = t.heightIn;
      }
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,0,0.3)';
      ctx.lineWidth = 1 / Math.max(0.0001, view.scale);
      for (let x = 0; x <= w + 1e-6; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h + 1e-6; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/**
 * Build the set of debug RenderLayers that the user has enabled via
 * `?debug=token1,token2`. Tokens supported: `hitboxes`, `bounds`, `axes`,
 * `grid`. (`handles` is also a recognised token, but its overlay layer is
 * created from the canvas prototypes so it can read the same selectable-
 * entity getters the real selection-handles layer uses; see
 * `createAllHandlesLayer` in `selectionLayersWorld.ts`.)
 */
export function createDebugLayers(mode: Mode, getGarden: () => Garden): RenderLayer<unknown>[] {
  const out: RenderLayer<unknown>[] = [];
  if (isDebugEnabled('hitboxes')) out.push(makeHitboxLayer(mode, getGarden));
  if (isDebugEnabled('bounds')) out.push(makeBoundsLayer(mode, getGarden));
  if (isDebugEnabled('axes')) out.push(makeAxesLayer());
  if (isDebugEnabled('grid')) out.push(makeGridLayer(mode, getGarden));
  return out;
}
