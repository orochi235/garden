import {
  type RenderLayer,
  PathBuilder,
  rectPath,
} from '@orochi235/weasel';
import { type DrawCommand, viewToMat3 } from '../util/weaselLocal';
import type { Dims, View } from '@orochi235/weasel';
import type { Garden } from '../../model/types';
import { trayInteriorOffsetIn } from '../../model/seedStarting';
import { isDebugEnabled } from '../debug';

type Mode = 'garden' | 'seed-starting';

interface Bbox { x: number; y: number; w: number; h: number; label?: string }

function bboxesGarden(g: Garden): Bbox[] {
  const out: Bbox[] = [];
  for (const s of g.structures) {
    out.push({ x: s.x, y: s.y, w: s.width, h: s.length, label: s.label || s.type });
  }
  for (const z of g.zones) {
    out.push({ x: z.x, y: z.y, w: z.width, h: z.length, label: z.label });
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

/** Approximate a full circle as 4 cubic-bezier segments. */
function circlePath(cx: number, cy: number, r: number): ReturnType<PathBuilder['build']> {
  // Kappa constant for circle approximation with cubic bezier.
  const k = 0.5522847498;
  return new PathBuilder()
    .moveTo(cx, cy - r)
    .curveTo(cx + r * k, cy - r, cx + r, cy - r * k, cx + r, cy)
    .curveTo(cx + r, cy + r * k, cx + r * k, cy + r, cx, cy + r)
    .curveTo(cx - r * k, cy + r, cx - r, cy + r * k, cx - r, cy)
    .curveTo(cx - r, cy - r * k, cx - r * k, cy - r, cx, cy - r)
    .close()
    .build();
}

function makeHitboxLayer(mode: Mode, getGarden: () => Garden): RenderLayer<unknown> {
  return {
    id: 'debug-hitboxes',
    label: 'Debug: Hitboxes',
    alwaysOn: true,
    draw(_data, view: View, _dims: Dims): DrawCommand[] {
      const g = getGarden();
      const items = mode === 'garden' ? bboxesGarden(g) : bboxesSeedStarting(g);
      const lw = 1 / Math.max(0.0001, view.scale);
      const stroke = { paint: { fill: 'solid' as const, color: '#ff0040' }, width: lw };
      const children: DrawCommand[] = items.map((b) => ({
        kind: 'path',
        path: rectPath(b.x, b.y, b.w, b.h),
        stroke,
      }));
      return [{ kind: 'group', transform: viewToMat3(view), alpha: 0.3, children }];
    },
  };
}

function makeBoundsLayer(mode: Mode, getGarden: () => Garden): RenderLayer<unknown> {
  return {
    id: 'debug-bounds',
    label: 'Debug: Bounds',
    alwaysOn: true,
    draw(_data, view: View, _dims: Dims): DrawCommand[] {
      const g = getGarden();
      let x: number, y: number, w: number, h: number;
      if (mode === 'garden') {
        x = 0; y = 0; w = g.widthFt; h = g.lengthFt;
      } else {
        const t = g.seedStarting.trays[0];
        if (!t) return [];
        x = 0; y = 0; w = t.widthIn; h = t.heightIn;
      }
      const lw = 2 / Math.max(0.0001, view.scale);
      const dashSize = 4 / view.scale;
      const children: DrawCommand[] = [
        {
          kind: 'path',
          path: rectPath(x, y, w, h),
          stroke: {
            paint: { fill: 'solid', color: '#00ffff' },
            width: lw,
            dash: [dashSize, dashSize],
          },
        },
      ];
      return [{ kind: 'group', transform: viewToMat3(view), children }];
    },
  };
}

function makeAxesLayer(): RenderLayer<unknown> {
  return {
    id: 'debug-axes',
    label: 'Debug: Axes',
    alwaysOn: true,
    draw(_data, view: View, _dims: Dims): DrawCommand[] {
      const px = (n: number) => n / Math.max(0.0001, view.scale);
      const lw = px(2);
      const xAxis = new PathBuilder().moveTo(0, 0).lineTo(100, 0).build();
      const yAxis = new PathBuilder().moveTo(0, 0).lineTo(0, 100).build();
      const dot = circlePath(0, 0, px(4));
      const children: DrawCommand[] = [
        {
          kind: 'path', path: xAxis,
          stroke: { paint: { fill: 'solid', color: '#ff4040' }, width: lw },
        },
        {
          kind: 'path', path: yAxis,
          stroke: { paint: { fill: 'solid', color: '#40ff40' }, width: lw },
        },
        {
          kind: 'path', path: dot,
          fill: { fill: 'solid', color: '#ffffff' },
        },
        // Labels — flagged: text rendering requires registerFont() wired at app boot.
        {
          kind: 'text', x: 100 - px(20), y: -px(4),
          text: '+x', style: { fontSize: px(12), fill: { fill: 'solid', color: '#ffffff' } },
        },
        {
          kind: 'text', x: px(4), y: 100 - px(4),
          text: '+y', style: { fontSize: px(12), fill: { fill: 'solid', color: '#ffffff' } },
        },
        {
          kind: 'text', x: px(6), y: -px(6),
          text: '(0,0)', style: { fontSize: px(12), fill: { fill: 'solid', color: '#ffffff' } },
        },
      ];
      return [{ kind: 'group', transform: viewToMat3(view), children }];
    },
  };
}

function makeGridLayer(mode: Mode, getGarden: () => Garden): RenderLayer<unknown> {
  return {
    id: 'debug-grid',
    label: 'Debug: Grid',
    alwaysOn: true,
    draw(_data, view: View, _dims: Dims): DrawCommand[] {
      const g = getGarden();
      let step: number, w: number, h: number;
      if (mode === 'garden') {
        step = g.gridCellSizeFt; w = g.widthFt; h = g.lengthFt;
      } else {
        const t = g.seedStarting.trays[0];
        if (!t) return [];
        step = t.cellPitchIn; w = t.widthIn; h = t.heightIn;
      }
      const lw = 1 / Math.max(0.0001, view.scale);
      const stroke = { paint: { fill: 'solid' as const, color: 'rgba(255,255,0,0.3)' }, width: lw };
      const children: DrawCommand[] = [];
      for (let x = 0; x <= w + 1e-6; x += step) {
        children.push({
          kind: 'path',
          path: new PathBuilder().moveTo(x, 0).lineTo(x, h).build(),
          stroke,
        });
      }
      for (let y = 0; y <= h + 1e-6; y += step) {
        children.push({
          kind: 'path',
          path: new PathBuilder().moveTo(0, y).lineTo(w, y).build(),
          stroke,
        });
      }
      return [{ kind: 'group', transform: viewToMat3(view), children }];
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
