import {
  type RenderLayer,
} from '@orochi235/weasel';
import { type DrawCommand, viewToMat3, circlePolygon } from '../util/weaselLocal';
import type { Dims, View } from '@orochi235/weasel';
import type { Seedling, Tray } from '../../model/nursery';
import { trayInteriorOffsetIn } from '../../model/nursery';
import { getCultivar } from '../../model/cultivars';
import {
  cultivarHasTrayWarning,
  hasSeedlingWarnings,
  SEEDLING_WARNING_COLOR,
} from '../../model/seedlingWarnings';
import { trayWorldOrigin } from '../adapters/nurseryScene';
import { useGardenStore } from '../../store/gardenStore';
import { plantDrawCommands } from '../plantRenderers';

export interface SeedFillPreview {
  trayId: string;
  cultivarId: string;
  scope: 'all' | 'row' | 'col' | 'cell';
  index?: number;
  row?: number;
  col?: number;
  replace?: boolean;
}

export interface SeedlingLayerUi {
  showWarnings: boolean;
  selectedIds: string[];
  hiddenSeedlingIds: string[];
  fillPreview: SeedFillPreview | null;
}

export type GetSeedlings = () => Seedling[];
export type GetTrays = () => Tray[];
export type GetSeedlingUi = () => SeedlingLayerUi;
export type GetSeedlingHighlight = (id: string) => number;

function px(view: View, p: number): number {
  return p / Math.max(0.0001, view.scale);
}

/** Column-major 3×3 translation matrix. */
function translateMat3(tx: number, ty: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 1, 0, tx, ty, 1]);
}


interface SownCellEntry { row: number; col: number; seedling: Seedling }

function collectSownCells(
  tray: Tray,
  seedlings: Seedling[],
  hiddenIds?: Iterable<string>,
): SownCellEntry[] {
  const byId = new Map(seedlings.map((s) => [s.id, s]));
  const hidden = hiddenIds ? new Set(hiddenIds) : null;
  const out: SownCellEntry[] = [];
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      const slot = tray.slots[r * tray.cols + c];
      if (slot.state !== 'sown' || !slot.seedlingId) continue;
      if (hidden?.has(slot.seedlingId)) continue;
      const seedling = byId.get(slot.seedlingId);
      if (seedling) out.push({ row: r, col: c, seedling });
    }
  }
  return out;
}

/**
 * Render a plant glyph as DrawCommands at local origin (0, 0).
 * The caller wraps in a translated group to position in world space.
 */
function plantGlyphCommands(
  cultivarId: string,
  radius: number,
  alpha: number,
): DrawCommand[] {
  const cultivar = getCultivar(cultivarId);
  const color = cultivar?.color ?? '#4A7C59';
  const iconBgColor = cultivar?.iconBgColor ?? null;
  // plantDrawCommands centers at (cx, cy) = (0, 0); the group transform positions it.
  const cmds = plantDrawCommands(cultivarId, 0, 0, radius, color, iconBgColor);
  if (alpha < 1) {
    return [{ kind: 'group', alpha, children: cmds }];
  }
  return cmds;
}

function warningRingCommand(cx: number, cy: number, radiusIn: number, view: View): DrawCommand {
  return {
    kind: 'path',
    path: circlePolygon(cx, cy, radiusIn + px(view, 2)),
    stroke: { paint: { fill: 'solid', color: SEEDLING_WARNING_COLOR }, width: px(view, 1.5) },
  };
}

function selectionRingCommand(cx: number, cy: number, radius: number, view: View): DrawCommand {
  return {
    kind: 'path',
    path: circlePolygon(cx, cy, radius + px(view, 3)),
    stroke: {
      paint: { fill: 'solid', color: '#5BA4CF' },
      width: px(view, 2),
      dash: [px(view, 5), px(view, 3)],
    },
  };
}

function seedlingCommandsForTray(
  tray: Tray,
  seedlings: Seedling[],
  ui: SeedlingLayerUi,
  view: View,
  getHighlight?: GetSeedlingHighlight,
): DrawCommand[] {
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const radius = (p * 0.85) / 2;
  const cmds: DrawCommand[] = [];

  for (const { row, col, seedling } of collectSownCells(tray, seedlings, ui.hiddenSeedlingIds)) {
    const cultivar = getCultivar(seedling.cultivarId);
    if (!cultivar) continue;
    const cx = off.x + col * p + p / 2;
    const cy = off.y + row * p + p / 2;

    const flash = getHighlight ? getHighlight(seedling.id) : 0;
    const alpha = flash > 0 ? Math.max(0.2, 1 - flash * 0.6) : 1;

    const glyphChildren = plantGlyphCommands(seedling.cultivarId, radius, alpha);
    // Place glyph at cell centre
    cmds.push({
      kind: 'group',
      transform: translateMat3(cx, cy),
      children: glyphChildren,
    });

    if (ui.showWarnings && hasSeedlingWarnings(seedling, tray)) {
      cmds.push(warningRingCommand(cx, cy, radius, view));
    }

    if (ui.selectedIds.includes(seedling.id)) {
      cmds.push(selectionRingCommand(cx, cy, radius, view));
    }
  }
  return cmds;
}

function seedlingLabelCommandsForTray(
  tray: Tray,
  seedlings: Seedling[],
  ui: SeedlingLayerUi,
  view: View,
): DrawCommand[] {
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const fontPx = Math.max(8, px(view, 11));
  const cmds: DrawCommand[] = [];

  for (const { row, col, seedling } of collectSownCells(tray, seedlings, ui.hiddenSeedlingIds)) {
    const cultivar = getCultivar(seedling.cultivarId);
    if (!cultivar) continue;
    const cx = off.x + col * p + p / 2;
    const cy = off.y + row * p + p / 2;
    const label = seedling.labelOverride ?? cultivar.name.slice(0, 4);
    // Flagged: text commands require registerFont() wired at app boot.
    cmds.push({
      kind: 'text',
      x: cx,
      y: cy,
      text: label,
      style: {
        fontSize: fontPx,
        align: 'center' as const,
        fill: { fill: 'solid' as const, color: '#ffffff' },
      },
    });
  }
  return cmds;
}

function fillPreviewCommandsForTray(
  tray: Tray,
  preview: SeedFillPreview,
  showWarnings: boolean,
  view: View,
): DrawCommand[] {
  if (preview.trayId !== tray.id) return [];
  const cultivar = getCultivar(preview.cultivarId);
  if (!cultivar) return [];
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const radius = (p * 0.85) / 2;
  const scope = preview.scope;
  const idx = preview.index ?? 0;
  const cellR = preview.row ?? 0;
  const cellC = preview.col ?? 0;
  const previewWarn = showWarnings && cultivarHasTrayWarning(cultivar.id, tray);

  const innerCmds: DrawCommand[] = [];
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      if (scope === 'row' && r !== idx) continue;
      if (scope === 'col' && c !== idx) continue;
      if (scope === 'cell' && (r !== cellR || c !== cellC)) continue;
      const slot = tray.slots[r * tray.cols + c];
      if (slot.state === 'sown' && !preview.replace) continue;
      const cx = off.x + c * p + p / 2;
      const cy = off.y + r * p + p / 2;
      const glyphChildren = plantGlyphCommands(cultivar.id, radius, 1);
      innerCmds.push({
        kind: 'group',
        transform: translateMat3(cx, cy),
        children: glyphChildren,
      });
      if (previewWarn) {
        innerCmds.push(warningRingCommand(cx, cy, radius, view));
      }
    }
  }
  if (innerCmds.length === 0) return [];
  return [{ kind: 'group', alpha: 0.4, children: innerCmds }];
}

function trayWorldTranslate(tray: Tray): Float32Array {
  const ss = useGardenStore.getState().garden.nursery;
  const o = trayWorldOrigin(tray, ss);
  return translateMat3(o.x, o.y);
}

export function createSeedlingLayers(
  getTrays: GetTrays,
  getSeedlings: GetSeedlings,
  getUi: GetSeedlingUi,
  getHighlight?: GetSeedlingHighlight,
): RenderLayer<unknown>[] {
  return [
    {
      id: 'seedlings',
      label: 'Seedlings',
      alwaysOn: true,
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const ui = getUi();
        const seedlings = getSeedlings();
        const trayChildren: DrawCommand[] = getTrays().map((tray) => ({
          kind: 'group' as const,
          transform: trayWorldTranslate(tray),
          children: seedlingCommandsForTray(tray, seedlings, ui, view, getHighlight),
        }));
        return [{ kind: 'group', transform: viewToMat3(view), children: trayChildren }];
      },
    },
    {
      id: 'seedling-labels',
      label: 'Seedling Labels',
      defaultVisible: false,
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const ui = getUi();
        const seedlings = getSeedlings();
        const trayChildren: DrawCommand[] = getTrays().map((tray) => ({
          kind: 'group' as const,
          transform: trayWorldTranslate(tray),
          children: seedlingLabelCommandsForTray(tray, seedlings, ui, view),
        }));
        return [{ kind: 'group', transform: viewToMat3(view), children: trayChildren }];
      },
    },
    {
      id: 'seedling-fill-preview',
      label: 'Seedling Fill Preview',
      alwaysOn: true,
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
        const ui = getUi();
        if (!ui.fillPreview) return [];
        const trayChildren: DrawCommand[] = getTrays().flatMap((tray) => {
          const cmds = fillPreviewCommandsForTray(tray, ui.fillPreview!, ui.showWarnings, view);
          if (cmds.length === 0) return [];
          return [{
            kind: 'group' as const,
            transform: trayWorldTranslate(tray),
            children: cmds,
          }];
        });
        return [{ kind: 'group', transform: viewToMat3(view), children: trayChildren }];
      },
    },
  ];
}
