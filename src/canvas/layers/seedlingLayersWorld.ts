import type { RenderLayer } from '@orochi235/weasel';
import type { Seedling, Tray } from '../../model/seedStarting';
import { trayInteriorOffsetIn } from '../../model/seedStarting';
import { getCultivar } from '../../model/cultivars';
import {
  cultivarHasTrayWarning,
  hasSeedlingWarnings,
  SEEDLING_WARNING_COLOR,
} from '../../model/seedlingWarnings';
import { renderPlant } from '../plantRenderers';
import { trayWorldOrigin } from '../adapters/seedStartingScene';
import { useGardenStore } from '../../store/gardenStore';
import type { View } from './worldLayerData';

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

export interface SeedFillPreview {
  trayId: string;
  cultivarId: string;
  scope: 'all' | 'row' | 'col' | 'cell';
  index?: number;
  row?: number;
  col?: number;
  replace?: boolean;
}

export interface SeedMovePreview {
  trayId: string;
  cells: Array<{ row: number; col: number; cultivarId: string; bumped: boolean }>;
  feasible: boolean;
}

export interface SeedlingLayerUi {
  showWarnings: boolean;
  selectedIds: string[];
  hiddenSeedlingIds: string[];
  fillPreview: SeedFillPreview | null;
  movePreview: SeedMovePreview | null;
}

export type GetSeedlings = () => Seedling[];
export type GetTrays = () => Tray[];
export type GetSeedlingUi = () => SeedlingLayerUi;
export type GetSeedlingHighlight = (id: string) => number;

function px(view: View, p: number): number {
  return p / Math.max(0.0001, view.scale);
}

function strokeWarningRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusIn: number,
  view: View,
): void {
  ctx.save();
  ctx.strokeStyle = SEEDLING_WARNING_COLOR;
  ctx.lineWidth = px(view, 1.5);
  ctx.beginPath();
  ctx.arc(cx, cy, radiusIn + px(view, 2), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSeedlingsForTray(
  ctx: CanvasRenderingContext2D,
  tray: Tray,
  seedlings: Seedling[],
  ui: SeedlingLayerUi,
  view: View,
  getHighlight?: GetSeedlingHighlight,
): void {
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const radius = (p * 0.85) / 2;

  for (const { row, col, seedling } of collectSownCells(tray, seedlings, ui.hiddenSeedlingIds)) {
    const cultivar = getCultivar(seedling.cultivarId);
    if (!cultivar) continue;
    const cx = off.x + col * p + p / 2;
    const cy = off.y + row * p + p / 2;

    const flash = getHighlight ? getHighlight(seedling.id) : 0;
    ctx.save();
    ctx.translate(cx, cy);
    if (flash > 0) ctx.globalAlpha = Math.max(0.2, 1 - flash * 0.6);
    renderPlant(ctx, seedling.cultivarId, radius, cultivar.color);
    ctx.restore();

    if (ui.showWarnings && hasSeedlingWarnings(seedling, tray)) {
      strokeWarningRing(ctx, cx, cy, radius, view);
    }

    if (ui.selectedIds.includes(seedling.id)) {
      ctx.save();
      ctx.strokeStyle = '#5BA4CF';
      ctx.lineWidth = px(view, 2);
      ctx.setLineDash([px(view, 5), px(view, 3)]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius + px(view, 3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

function drawSeedlingLabelsForTray(
  ctx: CanvasRenderingContext2D,
  tray: Tray,
  seedlings: Seedling[],
  ui: SeedlingLayerUi,
  view: View,
): void {
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const fontPx = Math.max(8, px(view, 11));

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = px(view, 2);
  ctx.font = `${fontPx}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const { row, col, seedling } of collectSownCells(tray, seedlings, ui.hiddenSeedlingIds)) {
    const cultivar = getCultivar(seedling.cultivarId);
    if (!cultivar) continue;
    const cx = off.x + col * p + p / 2;
    const cy = off.y + row * p + p / 2;
    const label = seedling.labelOverride ?? cultivar.name.slice(0, 4);
    ctx.strokeText(label, cx, cy);
    ctx.fillText(label, cx, cy);
  }
  ctx.restore();
}

function drawFillPreview(
  ctx: CanvasRenderingContext2D,
  tray: Tray,
  preview: SeedFillPreview,
  showWarnings: boolean,
  view: View,
): void {
  if (preview.trayId !== tray.id) return;
  const cultivar = getCultivar(preview.cultivarId);
  if (!cultivar) return;
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const radius = (p * 0.85) / 2;
  const scope = preview.scope;
  const idx = preview.index ?? 0;
  const cellR = preview.row ?? 0;
  const cellC = preview.col ?? 0;
  const previewWarn = showWarnings && cultivarHasTrayWarning(cultivar.id, tray);

  ctx.save();
  ctx.globalAlpha = 0.4;
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      if (scope === 'row' && r !== idx) continue;
      if (scope === 'col' && c !== idx) continue;
      if (scope === 'cell' && (r !== cellR || c !== cellC)) continue;
      const slot = tray.slots[r * tray.cols + c];
      if (slot.state === 'sown' && !preview.replace) continue;
      const cx = off.x + c * p + p / 2;
      const cy = off.y + r * p + p / 2;
      ctx.save();
      ctx.translate(cx, cy);
      renderPlant(ctx, cultivar.id, radius, cultivar.color);
      ctx.restore();
      if (previewWarn) {
        strokeWarningRing(ctx, cx, cy, radius, view);
      }
    }
  }
  ctx.restore();
}

function drawMovePreview(
  ctx: CanvasRenderingContext2D,
  tray: Tray,
  preview: SeedMovePreview,
  view: View,
): void {
  if (preview.trayId !== tray.id || preview.cells.length === 0) return;
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const radius = (p * 0.85) / 2;

  ctx.save();
  ctx.globalAlpha = preview.feasible ? 0.6 : 0.35;
  for (const m of preview.cells) {
    const cultivar = getCultivar(m.cultivarId);
    if (!cultivar) continue;
    const cx = off.x + m.col * p + p / 2;
    const cy = off.y + m.row * p + p / 2;
    ctx.save();
    ctx.translate(cx, cy);
    renderPlant(ctx, cultivar.id, radius, cultivar.color);
    ctx.restore();
    if (m.bumped) {
      ctx.save();
      ctx.strokeStyle = '#d4a55a';
      ctx.lineWidth = px(view, 1.5);
      ctx.setLineDash([px(view, 4), px(view, 3)]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius + px(view, 2.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
  if (!preview.feasible) {
    ctx.save();
    ctx.strokeStyle = 'rgba(220, 60, 60, 0.7)';
    ctx.lineWidth = px(view, 2);
    for (const m of preview.cells) {
      const cx = off.x + m.col * p + p / 2;
      const cy = off.y + m.row * p + p / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + px(view, 2.5), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
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
      draw(ctx, _data, view) {
        const ui = getUi();
        const seedlings = getSeedlings();
        for (const tray of getTrays()) {
          withTrayTransform(ctx, tray, () => drawSeedlingsForTray(ctx, tray, seedlings, ui, view, getHighlight));
        }
      },
    },
    {
      id: 'seedling-labels',
      label: 'Seedling Labels',
      defaultVisible: false,
      draw(ctx, _data, view) {
        const ui = getUi();
        const seedlings = getSeedlings();
        for (const tray of getTrays()) {
          withTrayTransform(ctx, tray, () => drawSeedlingLabelsForTray(ctx, tray, seedlings, ui, view));
        }
      },
    },
    {
      id: 'seedling-fill-preview',
      label: 'Seedling Fill Preview',
      alwaysOn: true,
      draw(ctx, _data, view) {
        const ui = getUi();
        if (!ui.fillPreview) return;
        for (const tray of getTrays()) {
          withTrayTransform(ctx, tray, () => drawFillPreview(ctx, tray, ui.fillPreview!, ui.showWarnings, view));
        }
      },
    },
    {
      id: 'seedling-move-preview',
      label: 'Seedling Move Preview',
      alwaysOn: true,
      draw(ctx, _data, view) {
        const ui = getUi();
        if (!ui.movePreview) return;
        for (const tray of getTrays()) {
          withTrayTransform(ctx, tray, () => drawMovePreview(ctx, tray, ui.movePreview!, view));
        }
      },
    },
  ];
}
