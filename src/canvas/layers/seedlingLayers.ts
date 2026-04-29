import type { Seedling, Tray } from '../../model/seedStarting';
import { trayInteriorOffsetIn } from '../../model/seedStarting';
import { getCultivar } from '../../model/cultivars';
import { cultivarHasTrayWarning, hasSeedlingWarnings, SEEDLING_WARNING_COLOR } from '../../model/seedlingWarnings';
import { renderPlant } from '../plantRenderers';

export interface SownCellEntry {
  row: number;
  col: number;
  seedling: Seedling;
}

function strokeWarningRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, p: number) {
  ctx.save();
  ctx.strokeStyle = SEEDLING_WARNING_COLOR;
  ctx.lineWidth = Math.max(1, p * 0.035);
  ctx.beginPath();
  ctx.arc(cx, cy, radius + Math.max(1.5, p * 0.05), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function collectSownCells(
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

export function renderSeedlings(
  ctx: CanvasRenderingContext2D,
  tray: Tray,
  seedlings: Seedling[],
  pxPerInch: number,
  originX: number,
  originY: number,
  options: {
    showLabel: boolean;
    showWarnings?: boolean;
    selectedIds?: string[];
    fillPreviewCultivarId?: string | null;
    fillPreviewScope?: 'all' | 'row' | 'col' | 'cell';
    fillPreviewIndex?: number;
    fillPreviewRow?: number;
    fillPreviewCol?: number;
    fillPreviewReplace?: boolean;
    hiddenSeedlingIds?: string[];
    movePreview?: {
      cells: Array<{ row: number; col: number; cultivarId: string; bumped: boolean }>;
      feasible: boolean;
    } | null;
  },
) {
  const p = tray.cellPitchIn * pxPerInch;
  const off = trayInteriorOffsetIn(tray);
  const ox = originX + off.x * pxPerInch;
  const oy = originY + off.y * pxPerInch;

  for (const { row, col, seedling } of collectSownCells(tray, seedlings, options.hiddenSeedlingIds)) {
    const cultivar = getCultivar(seedling.cultivarId);
    if (!cultivar) continue;
    const cx = ox + col * p + p / 2;
    const cy = oy + row * p + p / 2;
    const radius = (p * 0.85) / 2;

    ctx.save();
    ctx.translate(cx, cy);
    renderPlant(ctx, seedling.cultivarId, radius, cultivar.color);
    ctx.restore();

    if (options.showWarnings !== false && hasSeedlingWarnings(seedling, tray)) {
      strokeWarningRing(ctx, cx, cy, radius, p);
    }

    if (options.selectedIds?.includes(seedling.id)) {
      ctx.save();
      ctx.strokeStyle = '#5BA4CF';
      ctx.lineWidth = Math.max(1.5, p * 0.05);
      ctx.setLineDash([Math.max(3, p * 0.15), Math.max(2, p * 0.08)]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius + Math.max(2.5, p * 0.09), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (options.showLabel) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.font = `${Math.max(8, p * 0.22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = seedling.labelOverride ?? cultivar.name.slice(0, 4);
      ctx.strokeText(label, cx, cy);
      ctx.fillText(label, cx, cy);
    }
  }

  // Putative fill preview: rendered after sown seedlings so replacements visually cover existing.
  if (options.fillPreviewCultivarId) {
    const cultivar = getCultivar(options.fillPreviewCultivarId);
    if (cultivar) {
      const radius = (p * 0.85) / 2;
      const scope = options.fillPreviewScope ?? 'all';
      const idx = options.fillPreviewIndex ?? 0;
      const cellR = options.fillPreviewRow ?? 0;
      const cellC = options.fillPreviewCol ?? 0;
      const previewWarn =
        options.showWarnings !== false && cultivarHasTrayWarning(cultivar.id, tray);
      ctx.save();
      ctx.globalAlpha = 0.4;
      for (let r = 0; r < tray.rows; r++) {
        for (let c = 0; c < tray.cols; c++) {
          if (scope === 'row' && r !== idx) continue;
          if (scope === 'col' && c !== idx) continue;
          if (scope === 'cell' && (r !== cellR || c !== cellC)) continue;
          const slot = tray.slots[r * tray.cols + c];
          if (slot.state === 'sown' && !options.fillPreviewReplace) continue;
          const cx = ox + c * p + p / 2;
          const cy = oy + r * p + p / 2;
          ctx.save();
          ctx.translate(cx, cy);
          renderPlant(ctx, cultivar.id, radius, cultivar.color);
          ctx.restore();
          if (previewWarn) {
            strokeWarningRing(ctx, cx, cy, radius, p);
          }
        }
      }
      ctx.restore();
    }
  }

  // Multi-seedling move preview: ghosted icons in their resolved target cells.
  if (options.movePreview && options.movePreview.cells.length > 0) {
    const radius = (p * 0.85) / 2;
    ctx.save();
    ctx.globalAlpha = options.movePreview.feasible ? 0.6 : 0.35;
    for (const m of options.movePreview.cells) {
      const cultivar = getCultivar(m.cultivarId);
      if (!cultivar) continue;
      const cx = ox + m.col * p + p / 2;
      const cy = oy + m.row * p + p / 2;
      ctx.save();
      ctx.translate(cx, cy);
      renderPlant(ctx, cultivar.id, radius, cultivar.color);
      ctx.restore();
      if (m.bumped) {
        // Faint outline so the user can see which icons were redirected.
        ctx.save();
        ctx.strokeStyle = '#d4a55a';
        ctx.lineWidth = Math.max(1, p * 0.04);
        ctx.setLineDash([Math.max(2, p * 0.1), Math.max(2, p * 0.08)]);
        ctx.beginPath();
        ctx.arc(cx, cy, radius + Math.max(2, p * 0.08), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    if (!options.movePreview.feasible) {
      ctx.save();
      ctx.strokeStyle = 'rgba(220, 60, 60, 0.7)';
      ctx.lineWidth = Math.max(1.5, p * 0.05);
      for (const m of options.movePreview.cells) {
        const cx = ox + m.col * p + p / 2;
        const cy = oy + m.row * p + p / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + Math.max(2, p * 0.08), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
