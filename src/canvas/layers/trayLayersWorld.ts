import {
  type RenderLayer,
} from '@orochi235/weasel';
import { type DrawCommand, viewToMat3, circlePolygon, roundRectPolygon } from '../util/weaselLocal';
import type { Dims, View } from '@orochi235/weasel';
import type { Tray, NurseryState } from '../../model/nursery';
import { trayInteriorOffsetIn } from '../../model/nursery';
import { trayWorldOrigin } from '../adapters/nurseryScene';
import { useGardenStore } from '../../store/gardenStore';

export type GetTrays = () => Tray[];

function px(view: View, p: number): number {
  return p / Math.max(0.0001, view.scale);
}

/** Column-major 3×3 translation matrix. */
function translateMat3(tx: number, ty: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 1, 0, tx, ty, 1]);
}


function trayBodyCommands(tray: Tray, view: View): DrawCommand[] {
  const w = tray.widthIn;
  const h = tray.heightIn;
  const radius = Math.min(w, h) * 0.04;
  const path = roundRectPolygon(0, 0, w, h, radius);
  return [
    {
      kind: 'path',
      path,
      fill: { fill: 'solid', color: '#3a3a3a' },
      stroke: { paint: { fill: 'solid', color: '#1a1a1a' }, width: px(view, 1) },
    },
  ];
}

function trayWellsCommands(tray: Tray, view: View): DrawCommand[] {
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const wellRadius = p * 0.4;
  const lw = px(view, 1);
  const cmds: DrawCommand[] = [];
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      const cx = off.x + c * p + p / 2;
      const cy = off.y + r * p + p / 2;
      cmds.push({
        kind: 'path',
        path: circlePolygon(cx, cy, wellRadius),
        fill: { fill: 'solid', color: 'rgba(0,0,0,0.22)' },
        stroke: { paint: { fill: 'solid', color: 'rgba(0,0,0,0.45)' }, width: lw },
      });
    }
  }
  return cmds;
}

function trayGridCommands(tray: Tray): DrawCommand[] {
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const dotRadius = p * 0.06;
  const cmds: DrawCommand[] = [];
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      const cx = off.x + c * p + p / 2;
      const cy = off.y + r * p + p / 2;
      cmds.push({
        kind: 'path',
        path: circlePolygon(cx, cy, dotRadius),
        fill: { fill: 'solid', color: 'rgba(91,164,207,0.5)' },
      });
    }
  }
  return cmds;
}

const LABEL_FONT_PX = 12;
const LABEL_GAP_PX = 6;
const LABEL_AREA_PX = LABEL_FONT_PX + 10; // hit-test height in screen px

/**
 * Returns the tray whose label area contains the world-space point, or null.
 * The label area is a rect below the tray body: full tray width, LABEL_AREA_PX
 * tall (converted to world units via the current scale).
 */
export function hitTestTrayLabel(
  trays: Tray[],
  ss: NurseryState,
  view: View,
  worldX: number,
  worldY: number,
): Tray | null {
  const areaH = LABEL_AREA_PX / Math.max(0.0001, view.scale);
  for (const tray of trays) {
    const o = trayWorldOrigin(tray, ss);
    const labelTop = o.y + tray.heightIn + LABEL_GAP_PX / view.scale;
    if (
      worldX >= o.x &&
      worldX <= o.x + tray.widthIn &&
      worldY >= labelTop &&
      worldY <= labelTop + areaH
    ) {
      return tray;
    }
  }
  return null;
}

// Flagged: text commands require registerFont() wired at app boot.
function trayLabelCommands(tray: Tray, view: View): DrawCommand[] {
  const fontSize = px(view, LABEL_FONT_PX);
  const gapY = tray.heightIn + px(view, LABEL_GAP_PX);
  return [
    {
      kind: 'text',
      x: tray.widthIn / 2,
      y: gapY,
      text: tray.label,
      style: {
        fontSize,
        align: 'center' as const,
        fill: { fill: 'solid' as const, color: 'rgba(255,255,255,0.65)' },
      },
    },
  ];
}

function trayGroupCommand(tray: Tray, children: DrawCommand[]): DrawCommand {
  const ss = useGardenStore.getState().garden.nursery;
  const o = trayWorldOrigin(tray, ss);
  return { kind: 'group', transform: translateMat3(o.x, o.y), children };
}

export function createTrayLayers(getTrays: GetTrays): RenderLayer<unknown>[] {
  return [
    {
      id: 'tray-body',
      label: 'Tray Body',
      alwaysOn: true,
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const children = getTrays().map((tray) =>
          trayGroupCommand(tray, trayBodyCommands(tray, view)),
        );
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
    {
      id: 'tray-wells',
      label: 'Tray Wells',
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const children = getTrays().map((tray) =>
          trayGroupCommand(tray, trayWellsCommands(tray, view)),
        );
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
    {
      id: 'tray-grid',
      label: 'Tray Grid',
      defaultVisible: true,
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const children = getTrays().map((tray) =>
          trayGroupCommand(tray, trayGridCommands(tray)),
        );
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
    {
      id: 'tray-labels',
      label: 'Tray Labels',
      alwaysOn: true,
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const children = getTrays().map((tray) =>
          trayGroupCommand(tray, trayLabelCommands(tray, view)),
        );
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
  ];
}
